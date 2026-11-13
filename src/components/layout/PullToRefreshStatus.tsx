import { Text } from '@mantine/core';
import { usePullToRefresh, type PullState } from '@hooks';

interface PullToRefreshStatusProps {
  /** Whether pulling down may refresh now */
  enabled: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}

const PULL_HINTS: Record<PullState, string> = {
  idle: '',
  pulling: 'Pull down to refresh from the folder',
  ready: 'Release to refresh from the folder',
};

/**
 * Pulling the page down refreshes from the folder; this shows how far the
 * pull is, and says when HemoIO is refreshing. Only the refreshing is
 * announced: the hints change with the finger. Its own component, so a
 * pull redraws only it.
 */
export function PullToRefreshStatus({ enabled, refreshing, onRefresh }: PullToRefreshStatusProps): React.ReactNode {
  const hint = PULL_HINTS[usePullToRefresh(onRefresh, enabled && !refreshing)];
  return (
    <>
      <Text role="status" ta="center" size="sm" c="dimmed" mb={refreshing ? 'xs' : 0}>
        {refreshing ? 'Refreshing from the folder…' : ''}
      </Text>
      {hint && (
        <Text aria-hidden="true" ta="center" size="sm" c="dimmed" mb="xs">
          {hint}
        </Text>
      )}
    </>
  );
}
