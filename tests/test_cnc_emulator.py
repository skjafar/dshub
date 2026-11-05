"""Deterministic CNC and wire-contract regression tests (standard library only)."""
import contextlib
import importlib.util
import io
import pathlib
import struct
import socket
import threading
import time
from unittest.mock import patch
import unittest

spec = importlib.util.spec_from_file_location('device', pathlib.Path(__file__).parents[1] / 'emulator/dshub_emulator.py')
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


class CNCBehavior(unittest.TestCase):
    def setUp(self):
        self.device = d.DSHubEmulator()
        self.c = self.device.cnc_controller
        self.r = self.device.user_registers
        self.p = self.device.parameters

    def ticks(self, seconds):
        for _ in range(int(seconds * 100)):
            self.c.update(.01)

    def packet(self, cmd, address=0, value=0, interface='TCP'):
        with contextlib.redirect_stdout(io.StringIO()):
            response = self.device._process_packet(struct.pack('<HHi', cmd, address, value), interface, ('127.0.0.1', 12345))
        return struct.unpack('<hHi', response)

    def test_all_axis_commands_jog_feedback_and_disable(self):
        for i, axis in enumerate('XYZ'):
            self.assertEqual(self.c.handle_sys_command(2 + i, 0), 0)
            self.assertTrue(self.c.motors[axis].enabled)
            self.c.handle_sys_command(20 + i * 2, 0)
            self.assertEqual(self.r.read(10 + i), 100)
            self.ticks(.2)
            self.assertGreater(self.c.motors[axis].position, 0)
            self.assertEqual(self.c.state, d.STATE_RUNNING)
            self.c.handle_sys_command(21 + i * 2, 0)
            self.assertEqual(self.r.read(10 + i), 0)
            self.c.handle_sys_command(5 + i, 0)
            self.assertFalse(self.c.motors[axis].enabled)
        self.c.handle_sys_command(0, 0)
        self.assertTrue(all(m.enabled for m in self.c.motors.values()))
        self.c.handle_sys_command(1, 0)
        self.ticks(2)
        self.assertTrue(all(m.velocity == 0 for m in self.c.motors.values()))

    def test_homing_from_disabled_position_keeps_targets_until_settled(self):
        for i, m in enumerate(self.c.motors.values()):
            m.position = 500 + i * 100
            self.p.write(22 + i, -100 * i)
            self.r.write(10 + i, 5000)
        self.c.handle_sys_command(10, 0)
        self.ticks(60)
        self.assertEqual(self.c.state, d.STATE_READY)
        for i, m in enumerate(self.c.motors.values()):
            self.assertAlmostEqual(m.position, -100 * i, delta=.5)
            self.assertEqual(self.r.read(10 + i), -100 * i)
        for i, axis in enumerate('XYZ'):
            self.c.motors[axis].position = 50
            self.c.handle_sys_command(11 + i, 0)
            self.ticks(60)
            self.assertEqual(self.c.state, d.STATE_READY)

    def test_parameters_drive_motion_and_spindle_clamps(self):
        self.p.write(0, 25)
        self.p.write(3, 50)
        self.p.write(6, struct.unpack('<i', struct.pack('<f', 3.25))[0])
        self.c.handle_sys_command(0, 0)
        self.r.write(10, 1000)
        self.ticks(2)
        self.assertLessEqual(abs(self.c.motors['X'].velocity), 25)
        self.assertEqual(self.c.motors['X'].kp, 3.25)
        self.p.write(18, 1000)
        self.p.write(19, 500)
        self.r.write(13, 5000)
        self.c.handle_sys_command(8, 0)
        self.ticks(1)
        self.assertAlmostEqual(self.c.spindle.rpm, 500)
        self.ticks(3)
        self.assertEqual(self.c.spindle.rpm, 1000)
        self.c.handle_sys_command(9, 0)
        self.ticks(3)
        self.assertEqual(self.c.spindle.rpm, 0)

    def test_estop_latches_blocks_commands_and_never_reverses_velocity(self):
        self.c.handle_sys_command(0, 0)
        self.r.write(10, 1000)
        self.ticks(.5)
        self.c.handle_sys_command(14, 0)
        for cmd in [0, 2, 3, 4, 8, 10, 11, 12, 13, 20, 21, 22, 23, 24, 25]:
            self.assertEqual(self.c.handle_sys_command(cmd, 0), -1)
        self.ticks(2)
        self.assertEqual(self.c.state, d.STATE_E_STOP)
        self.assertEqual(self.c.motors['X'].velocity, 0)
        self.c.handle_sys_command(16, 0)
        self.assertEqual(self.c.state, d.STATE_E_STOP)
        self.c.handle_sys_command(15, 0)
        self.assertEqual(self.c.state, d.STATE_IDLE)
        self.assertTrue(all(not m.enabled for m in self.c.motors.values()))

    def test_flash_load_save_and_firmware_reset(self):
        self.packet(5, 0, 1)
        self.packet(4, 0, 123)
        self.packet(0, 65001)
        self.packet(4, 0, 456)
        self.packet(0, 65000)
        self.assertEqual(self.p.read(0), 123)
        self.packet(0, 0)
        self.packet(0, 65002)
        self.assertEqual(self.p.read(0), 123)
        self.assertEqual(self.device.cnc_controller.state, d.STATE_IDLE)
        self.assertTrue(all(not m.enabled for m in self.device.cnc_controller.motors.values()))
        self.assertEqual(self.packet(6, 2)[2], 0)

    def test_tcp_stream_handles_fragmented_and_coalesced_frames(self):
        server, client = socket.socketpair()
        client.settimeout(2)
        self.device.running = True
        worker = threading.Thread(target=self.device._handle_tcp_client,
                                  args=(server, ('127.0.0.1', 12345)))
        worker.start()
        try:
            first = struct.pack('<HHi', 5, 0, 1)
            client.sendall(first[:3])
            client.sendall(first[3:] + struct.pack('<HHi', 2, 10, 321) + struct.pack('<HHi', 1, 10, 0))
            data = b''
            while len(data) < 24:
                data += client.recv(24 - len(data))
            self.assertEqual([struct.unpack('<hHi', data[i:i+8]) for i in range(0, 24, 8)],
                             [(5, 0, 1), (2, 10, 321), (1, 10, 321)])
        finally:
            self.device.running = False
            client.close()
            worker.join(timeout=3)
            self.assertFalse(worker.is_alive())

    def test_updated_emulator_over_real_tcp_udp_and_discovery(self):
        # Reserve independent ports so a developer's running device is untouched.
        with socket.socket() as reserve:
            reserve.bind(('127.0.0.1', 0))
            tcp_port = reserve.getsockname()[1]
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as reserve:
            reserve.bind(('127.0.0.1', 0))
            udp_port = reserve.getsockname()[1]
        with patch.object(d, 'DEFAULT_TCP_PORT', tcp_port), patch.object(d, 'DEFAULT_UDP_PORT', udp_port), patch.object(d, 'DISCOVERY_PORT', udp_port):
            self.device.start()
            try:
                deadline = time.monotonic() + 3
                while True:
                    try:
                        tcp = socket.create_connection(('127.0.0.1', tcp_port), timeout=1)
                        break
                    except ConnectionRefusedError:
                        if time.monotonic() >= deadline:
                            raise
                        time.sleep(.01)
                with tcp, socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
                    tcp.settimeout(2)
                    udp.settimeout(2)
                    udp.sendto(struct.pack('<IB', d.DS_DISCOVERY_MAGIC, 1), ('127.0.0.1', udp_port))
                    discovery = udp.recv(1024)
                    self.assertEqual(struct.unpack('<IB', discovery[:5]), (d.DS_DISCOVERY_MAGIC, 2))
                    self.assertEqual(struct.unpack('<HH', discovery[16:20]), (tcp_port, udp_port))
                    for transport, owner in [(tcp, 1), (udp, 2)]:
                        def exchange(cmd, address, value=0):
                            packet = struct.pack('<HHi', cmd, address, value)
                            if owner == 1:
                                transport.sendall(packet)
                                data = b''
                                while len(data) < 8:
                                    data += transport.recv(8 - len(data))
                            else:
                                transport.sendto(packet, ('127.0.0.1', udp_port))
                                data = transport.recv(8)
                            return struct.unpack('<hHi', data)
                        self.assertEqual(exchange(5, 0, owner)[0], 5)
                        self.assertEqual(exchange(0, 0)[0], 0)
                        self.assertEqual(exchange(2, 10, 1000)[0], 2)
                        time.sleep(.1)
                        self.assertGreater(exchange(1, 1)[2], 0)
                        self.assertEqual(exchange(1, 0)[2], d.STATE_RUNNING)
                        self.assertEqual(exchange(0, 14)[0], 0)
                        self.assertLess(exchange(0, 0)[0], 0)
                        time.sleep(.15)
                        self.assertEqual(exchange(1, 0)[2], d.STATE_E_STOP)
                        self.assertEqual(exchange(0, 15)[0], 0)
            finally:
                self.device.stop()
                time.sleep(.02)

    def test_protocol_permissions_addresses_parameters_and_both_transports(self):
        self.assertEqual(self.packet(2, 10, 100)[0], -5)
        for interface, owner in [('TCP', 1), ('UDP', 2)]:
            self.assertEqual(self.packet(5, 0, owner, interface)[0], 5)
            self.assertEqual(self.packet(2, 10, -123, interface), (2, 10, -123))
            self.assertEqual(self.packet(1, 10, 0, interface), (1, 10, -123))
            for address in range(10):
                self.assertEqual(self.packet(2, address, 1, interface)[0], -5)
            for cmd in [1, 3, 6]:
                self.assertEqual(self.packet(cmd, 500, 0, interface)[0], -4)
            self.assertLess(self.packet(4, 30, 1, interface)[0], 0)
            self.assertLess(self.packet(4, 0, -1, interface)[0], 0)
            self.assertEqual(self.packet(7, 0, 1, interface)[0], -5)
            self.assertEqual(self.packet(0, 0, 0, interface)[0], 0)
            self.assertLess(self.packet(0, 999, 0, interface)[0], 0)
            self.assertEqual(self.packet(6, 2, 0, interface)[2], owner)
        self.assertFalse(self.p.write(6, struct.unpack('<i', struct.pack('<f', float('nan')))[0]))
        self.assertFalse(self.r.write(14, -1))


if __name__ == '__main__':
    unittest.main()
