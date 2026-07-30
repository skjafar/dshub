import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Alert,
  AlertTitle,
  Stack,
} from '@mui/material';
import { Refresh as RefreshIcon, BugReport as BugIcon, ContentCopy as CopyIcon } from '@mui/icons-material';
import { FONT_MONO } from '../design/tokens';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
    });
  };

  /**
   * The stack trace used to be rendered inline, which turned a recoverable panel
   * error into a wall of implementation detail. It is still available, on demand.
   */
  private handleCopyDetails = () => {
    const details = [
      this.state.error?.stack ?? this.state.error?.toString() ?? 'Unknown error',
      this.state.errorInfo?.componentStack ?? '',
    ].join('\n\n');
    void navigator.clipboard.writeText(details).then(
      () => this.setState({ copied: true }),
      () => undefined
    );
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            bgcolor: 'background.default',
            p: 3,
          }}
        >
          <Card sx={{ maxWidth: 600, width: '100%' }}>
            <CardContent>
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <BugIcon color="error" sx={{ fontSize: 48 }} />
                  <Typography variant="h5" component="h1">
                    Something went wrong
                  </Typography>
                </Box>

                <Alert severity="error">
                  <AlertTitle>What happened</AlertTitle>
                  <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: FONT_MONO }}>
                    {this.state.error?.toString()}
                  </Typography>
                </Alert>

                <Typography variant="body2" color="text.secondary">
                  The rest of the application is still running. Try again, or copy the
                  technical details if you need to report this.
                </Typography>

                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    startIcon={<RefreshIcon />}
                    onClick={this.handleReset}
                    fullWidth
                  >
                    Try Again
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<CopyIcon />}
                    onClick={this.handleCopyDetails}
                    fullWidth
                  >
                    {this.state.copied ? 'Copied' : 'Copy Details'}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={this.handleReload}
                    fullWidth
                  >
                    Reload
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      );
    }

    return this.props.children;
  }
}
