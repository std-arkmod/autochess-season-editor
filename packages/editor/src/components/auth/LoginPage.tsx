import { useState } from 'react'
import {
  Container, Paper, Title, TextInput, PasswordInput,
  Button, Stack, Text, Center,
} from '@mantine/core'
import { IconLogin } from '@tabler/icons-react'
import type { AuthStore } from '../../store/authStore'

interface LoginPageProps {
  auth: AuthStore
}

export function LoginPage({ auth }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setSubmitting(true)
    try {
      await auth.login(username, password)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Center h="100vh" bg="dark.8">
      <Container size={400} w="100%">
        <Paper p="xl" radius="md" withBorder>
          <form onSubmit={handleSubmit}>
            <Stack>
              <Title order={2} ta="center">
                AutoChess 赛季编辑器
              </Title>
              <Text size="sm" c="dimmed" ta="center">
                登录以开始协作编辑
              </Text>

              <TextInput
                label="用户名"
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.currentTarget.value)}
                required
                autoFocus
              />

              <PasswordInput
                label="密码"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
              />

              {auth.error && (
                <Text c="red" size="sm">
                  {auth.error}
                </Text>
              )}

              <Button
                type="submit"
                fullWidth
                loading={submitting}
                leftSection={<IconLogin size={16} />}
              >
                登录
              </Button>
            </Stack>
          </form>
        </Paper>
      </Container>
    </Center>
  )
}
