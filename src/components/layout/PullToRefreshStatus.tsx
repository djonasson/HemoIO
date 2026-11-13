import { Text } from '@mantine/core';
import { usePullToRefresh, type PullState } from '@hooks';

interface PullToRefreshStatusProps {
  /** Whether pulling down may refresh now */
  enabled: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

const PULL_LABELS: Record<PullState, string> = {
  idle: '',
  pulling: 'Pull down to refresh from the folder',
  ready: 'Release to refresh from the folder',
};

/**
 * Pulling the page down refreshes from the folder; this says how far the
 * pull is, and when HemoIO is refreshing. Its own component, so a pull
 * redraws only it.
 */
export function PullToRefreshStatus({ enabled, refreshing, onRefresh }: PullToRefreshStatusProps): React.ReactNode {
  const pull = usePullToRefresh(onRefresh, enabled && !refreshing);
  const label = refreshing ? 'Refreshing from the folder…' : PULL_LABELS[pull];
  return (
    <Text role="status" ta="center" size="sm" c="dimmed" mb={label ? 'xs' : 0}>
      {label}
    </Text>
  );
}
