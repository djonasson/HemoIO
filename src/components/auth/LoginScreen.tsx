import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Container,
  Paper,
  Title,
  Text,
  PasswordInput,
  Button,
  Stack,
  Alert,
  Center,
  ThemeIcon,
} from '@mantine/core';
import { IconLock, IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '@contexts';

export function LoginScreen(): React.ReactNode {
  const { unlock } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Focus password input on mount
  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setIsUnlocking(true);

      try {
        const success = await unlock(password);
        if (!success) {
          setError('Incorrect password');
          setPassword('');
          passwordInputRef.current?.focus();
        }
      } catch {
        setError('An error occurred. Please try again.');
      } finally {
        setIsUnlocking(false);
      }
    },
    [password, unlock]
  );

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPassword(e.target.value);
      if (error) setError(null);
    },
    [error]
  );

  return (
    <Container size="xs" py="xl">
      <Stack gap="xl">
        <Center>
          <ThemeIcon size={80} radius="xl" variant="light" color="blue">
            <IconLock size={40} />
          </ThemeIcon>
        </Center>

        <div>
          <Title order={1} ta="center">
            HemoIO
          </Title>
          <Text c="dimmed" ta="center" mt="xs">
            Enter your password to unlock your lab data
          </Text>
        </div>

        <Paper withBorder shadow="md" p="xl" radius="md">
          <form onSubmit={handleSubmit}>
            <Stack gap="lg">
              {error && (
                <Alert
                  variant="light"
                  color="red"
                  icon={<IconAlertCircle size={16} />}
                  title="Error"
                  role="alert"
                >
                  {error}
                </Alert>
              )}

              <PasswordInput
                ref={passwordInputRef}
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={handlePasswordChange}
                visible={showPassword}
                onVisibilityChange={setShowPassword}
                error={error ? true : undefined}
                disabled={isUnlocking}
                aria-label="Password"
                aria-invalid={error ? 'true' : 'false'}
                required
              />

              <Button
                type="submit"
                fullWidth
                loading={isUnlocking}
                disabled={password.length === 0}
                leftSection={<IconLock size={16} />}
              >
                Unlock
              </Button>
            </Stack>
          </form>
        </Paper>

        <Text size="xs" c="dimmed" ta="center">
          Your data is encrypted locally and never leaves your device.
        </Text>
      </Stack>
    </Container>
  );
}
