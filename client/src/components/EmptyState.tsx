import { Box, Typography, Button } from '@mui/material';
import { SvgIconProps } from '@mui/material/SvgIcon';
import { FONT_HEADLINE } from '../theme';

interface EmptyStateProps {
  icon: React.ReactElement<SvgIconProps>;
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactElement;
  };
  hint?: React.ReactNode;
}

export default function EmptyState({ icon, title, subtitle, action, hint }: EmptyStateProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        gap: 1.5,
      }}
    >
      <Box sx={{ color: 'text.disabled', mb: 0.5, '& .MuiSvgIcon-root': { fontSize: '2.5rem' } }}>
        {icon}
      </Box>
      <Typography
        sx={{
          fontFamily: FONT_HEADLINE,
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: 'text.secondary',
        }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" sx={{ color: 'text.disabled', maxWidth: 360, textAlign: 'center' }}>
          {subtitle}
        </Typography>
      )}
      {action && (
        <Button
          variant="outlined"
          size="small"
          startIcon={action.icon}
          onClick={action.onClick}
          sx={{ mt: 1 }}
        >
          {action.label}
        </Button>
      )}
      {hint}
    </Box>
  );
}
