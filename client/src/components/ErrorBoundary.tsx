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
import { Refresh as RefreshIcon, BugReport as BugIcon } from '@mui/icons-material';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
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
    });
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
                  <AlertTitle>Error Details</AlertTitle>
                  <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace' }}>
                    {this.state.error?.toString()}
                  </Typography>
                </Alert>

                {this.state.errorInfo && (
                  <Alert severity="warning">
                    <AlertTitle>Stack Trace</AlertTitle>
                    <Typography
                      variant="body2"
                      component="pre"
                      sx={{
                        whiteSpace: 'pre-wrap',
                        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
                        fontSize: '0.75rem',
                        maxHeight: 200,
                        overflow: 'auto',
                      }}
                    >
                      {this.state.errorInfo.componentStack}
                    </Typography>
                  </Alert>
                )}

                <Typography variant="body2" color="text.secondary">
                  We're sorry for the inconvenience. You can try resetting the component or reloading the page.
                </Typography>

                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    startIcon={<RefreshIcon />}
                    onClick={this.handleReset}
                    fullWidth
                  >
                    Reset Component
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={this.handleReload}
                    fullWidth
                  >
                    Reload Page
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
