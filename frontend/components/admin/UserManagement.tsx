'use client'

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { supabase } from '@/lib/supabase'

export function UserManagement() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const { data, error: err } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })

      if (err) throw err

      setUsers(data || [])
      setLoading(false)
    } catch (err) {
      console.error('Error loading users:', err)
      setError('Failed to load users')
      setLoading(false)
    }
  }

  const filteredUsers = users.filter(
    (user) =>
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.last_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return <LoadingSpinner message="Loading users..." />
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <p className="text-red-200">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        type="text"
        placeholder="Search by email, first name, or last name..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
      />

      {/* Users Table */}
      {filteredUsers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">
            {users.length === 0 ? 'No users found' : 'No users match your search'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-gray-400 font-semibold">Email</th>
                <th className="px-4 py-3 text-left text-gray-400 font-semibold">Name</th>
                <th className="px-4 py-3 text-left text-gray-400 font-semibold">Role</th>
                <th className="px-4 py-3 text-left text-gray-400 font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-gray-400 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="px-4 py-3 text-gray-300">{user.email}</td>
                  <td className="px-4 py-3 text-gray-300">
                    {user.first_name} {user.last_name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        user.role === 'admin'
                          ? 'bg-red-500/20 text-red-200'
                          : user.role === 'planner'
                          ? 'bg-blue-500/20 text-blue-200'
                          : 'bg-gray-500/20 text-gray-200'
                      }`}
                    >
                      {user.role === 'public_user' ? 'Public' : user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        user.is_active ? 'bg-green-500/20 text-green-200' : 'bg-gray-500/20 text-gray-200'
                      }`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}