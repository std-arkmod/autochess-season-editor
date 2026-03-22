import { useState, useEffect, useCallback } from 'react'
import {
  Table, Button, Modal, TextInput, PasswordInput,
  Select, Stack, Group, Text, ActionIcon, Badge, Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconTrash, IconEdit } from '@tabler/icons-react'
import { api, type AuthUser } from '../../api/client'

export function UserManagement() {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false)
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null)

  // Form state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<string>('editor')

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.listUsers()
      setUsers(res.users)
    } catch {
      notifications.show({ title: '加载用户列表失败', message: '请检查权限', color: 'red' })
    }
  }, [])

  useEffect(() => { void loadUsers() }, [loadUsers])

  const handleCreate = async () => {
    try {
      await api.createUser({ username, password, displayName: displayName || username, role })
      closeCreate()
      setUsername('')
      setPassword('')
      setDisplayName('')
      setRole('editor')
      void loadUsers()
      notifications.show({ title: '创建成功', message: `用户 ${username} 已创建`, color: 'teal' })
    } catch (e) {
      notifications.show({ title: '创建失败', message: e instanceof Error ? e.message : '未知错误', color: 'red' })
    }
  }

  const handleUpdate = async () => {
    if (!editingUser) return
    try {
      const data: { displayName?: string; role?: string; password?: string } = {}
      if (displayName) data.displayName = displayName
      if (role) data.role = role
      if (password) data.password = password
      await api.updateUser(editingUser.id, data)
      setEditingUser(null)
      setPassword('')
      setDisplayName('')
      setRole('editor')
      void loadUsers()
      notifications.show({ title: '更新成功', message: `用户 ${editingUser.username} 已更新`, color: 'teal' })
    } catch (e) {
      notifications.show({ title: '更新失败', message: e instanceof Error ? e.message : '未知错误', color: 'red' })
    }
  }

  const handleDelete = async (user: AuthUser) => {
    try {
      await api.deleteUser(user.id)
      void loadUsers()
      notifications.show({ title: '已删除', message: `用户 ${user.username} 已删除`, color: 'teal' })
    } catch (e) {
      notifications.show({ title: '删除失败', message: e instanceof Error ? e.message : '未知错误', color: 'red' })
    }
  }

  const roleColors: Record<string, string> = {
    admin: 'red',
    editor: 'blue',
    viewer: 'gray',
  }
  const roleLabels: Record<string, string> = {
    admin: '管理员',
    editor: '编辑者',
    viewer: '查看者',
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Text fw={600} size="lg">用户管理</Text>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={openCreate}>
          添加用户
        </Button>
      </Group>

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>用户名</Table.Th>
            <Table.Th>显示名</Table.Th>
            <Table.Th>角色</Table.Th>
            <Table.Th>操作</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {users.map(user => (
            <Table.Tr key={user.id}>
              <Table.Td><Text size="sm" ff="monospace">{user.username}</Text></Table.Td>
              <Table.Td>{user.displayName}</Table.Td>
              <Table.Td>
                <Badge color={roleColors[user.role] ?? 'gray'} variant="light">
                  {roleLabels[user.role] ?? user.role}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Group gap={4}>
                  <Tooltip label="编辑">
                    <ActionIcon size="sm" variant="subtle" onClick={() => {
                      setEditingUser(user)
                      setDisplayName(user.displayName)
                      setRole(user.role)
                      setPassword('')
                    }}>
                      <IconEdit size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="删除">
                    <ActionIcon size="sm" variant="subtle" color="red" onClick={() => void handleDelete(user)}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {/* Create Modal */}
      <Modal opened={createOpened} onClose={closeCreate} title="添加用户">
        <Stack>
          <TextInput label="用户名" required value={username} onChange={e => setUsername(e.currentTarget.value)} />
          <PasswordInput label="密码" required value={password} onChange={e => setPassword(e.currentTarget.value)} />
          <TextInput label="显示名" value={displayName} onChange={e => setDisplayName(e.currentTarget.value)} />
          <Select label="角色" data={[
            { value: 'admin', label: '管理员' },
            { value: 'editor', label: '编辑者' },
            { value: 'viewer', label: '查看者' },
          ]} value={role} onChange={v => setRole(v ?? 'editor')} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={closeCreate}>取消</Button>
            <Button onClick={() => void handleCreate()} disabled={!username || !password}>创建</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Edit Modal */}
      <Modal opened={!!editingUser} onClose={() => setEditingUser(null)} title={`编辑用户 ${editingUser?.username}`}>
        <Stack>
          <TextInput label="显示名" value={displayName} onChange={e => setDisplayName(e.currentTarget.value)} />
          <Select label="角色" data={[
            { value: 'admin', label: '管理员' },
            { value: 'editor', label: '编辑者' },
            { value: 'viewer', label: '查看者' },
          ]} value={role} onChange={v => setRole(v ?? 'editor')} />
          <PasswordInput label="新密码（留空不修改）" value={password} onChange={e => setPassword(e.currentTarget.value)} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setEditingUser(null)}>取消</Button>
            <Button onClick={() => void handleUpdate()}>保存</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
