import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChatContext } from '@renderer/context/ChatContext'
import { getChatWorkspacePath } from '@renderer/utils/chatWorkspace'
import { useDevServerStore } from '@renderer/store/devServerStore'
import { toast } from 'sonner'
import {
  invokeCheckPreviewSh,
  invokeStartDevServer,
  invokeStopDevServer,
  invokeGetDevServerStatus
} from '@renderer/tools/devServer/renderer/DevServerInvoker'

export type DevServerStatus = 'idle' | 'starting' | 'running' | 'error' | 'stopped'

interface UseDevServerReturn {
  hasPreviewSh: boolean
  showErrorLogs: boolean
  setShowErrorLogs: (show: boolean) => void
  devServerStatus: DevServerStatus
  devServerPort: number | null
  devServerError: string | null
  devServerLogs: string[]
  handleStartDevServer: () => Promise<void>
  handleStopDevServer: () => Promise<void>
  handleRestartDevServer: () => Promise<void>
}

export function useDevServer(): UseDevServerReturn {
  const { chatUuid, chatList } = useChatContext()
  const {
    setDevServerStatus,
    setDevServerPort,
    setDevServerLogs,
    setDevServerError,
    devServerStatus,
    devServerPort,
    devServerLogs,
    devServerError
  } = useDevServerStore()

  // Local state
  const [hasPreviewSh, setHasPreviewSh] = useState(false)
  const [showErrorLogs, setShowErrorLogs] = useState(false)

  const currentWorkspacePath = useMemo(() => {
    return getChatWorkspacePath({ chatUuid, chatList })
  }, [chatUuid, chatList])

  // DevServer state from store
  const currentDevServerStatus = chatUuid ? devServerStatus[chatUuid] || 'idle' : 'idle'
  const currentDevServerPort = chatUuid ? devServerPort[chatUuid] : null
  const currentDevServerError = chatUuid ? devServerError[chatUuid] : null
  const currentDevServerLogs = chatUuid ? devServerLogs[chatUuid] || [] : []

  // Use ref to track latest dev server status for cleanup
  const devServerStatusRef = useRef(currentDevServerStatus)
  useEffect(() => {
    devServerStatusRef.current = currentDevServerStatus
  }, [currentDevServerStatus])

  // Check for preview.sh
  const checkForPreviewSh = useCallback(async () => {
    if (!chatUuid) {
      setHasPreviewSh(false)
      return
    }

    try {
      const result = await invokeCheckPreviewSh({ chatUuid, customWorkspacePath: currentWorkspacePath })
      setHasPreviewSh(result.exists)
      console.log('[useDevServer] Preview.sh exists:', result.exists)
    } catch (error) {
      console.error('[useDevServer] Error checking preview.sh:', error)
      setHasPreviewSh(false)
    }
  }, [chatUuid, currentWorkspacePath])

  // Poll status until port is detected or timeout
  const pollDevServerStatus = useCallback(() => {
    if (!chatUuid) return

    let attempts = 0
    const maxAttempts = 30 // 30 seconds timeout

    const intervalId = setInterval(async () => {
      attempts++

      try {
        const statusResult = await invokeGetDevServerStatus({ chatUuid })

        if (statusResult.success) {
          setDevServerStatus(chatUuid, statusResult.status)

          if (statusResult.port) {
            setDevServerPort(chatUuid, statusResult.port)
            console.log('[useDevServer] Dev server port detected:', statusResult.port)
          }

          if (statusResult.logs && statusResult.logs.length > 0) {
            setDevServerLogs(chatUuid, statusResult.logs)
          }

          if (statusResult.error) {
            setDevServerError(chatUuid, statusResult.error)
          }

          // Stop polling if running, error, or timeout
          if (statusResult.status === 'running' || statusResult.status === 'error' || attempts >= maxAttempts) {
            clearInterval(intervalId)

            if (statusResult.status === 'running' && statusResult.port) {
              toast.success('Server Started', {
                description: `Development server running on port ${statusResult.port}`
              })
            } else if (attempts >= maxAttempts && statusResult.status === 'starting') {
              console.error('[useDevServer] Timeout waiting for port detection')
              console.error('[useDevServer] Collected logs:', statusResult.logs)
              console.error('[useDevServer] Server status:', statusResult.status)
              console.error('[useDevServer] Port:', statusResult.port)

              // Stop the server since we can't detect the port
              console.log('[useDevServer] Stopping server due to timeout')
              await invokeStopDevServer({ chatUuid })

              setDevServerStatus(chatUuid, 'error')
              setDevServerError(chatUuid, 'Timeout: Could not detect server port after 30 seconds. The server process has been stopped.')
              toast.error('Timeout', {
                description: 'Could not detect server port. Server stopped.'
              })
            }
          }
        }
      } catch (error: any) {
        console.error('[useDevServer] Error polling dev server status:', error)
        clearInterval(intervalId)
        setDevServerStatus(chatUuid, 'error')
        setDevServerError(chatUuid, error.message || 'Failed to get server status')
      }
    }, 1000) // Poll every second
  }, [chatUuid, setDevServerStatus, setDevServerPort, setDevServerLogs, setDevServerError])

  // Start development server
  const handleStartDevServer = useCallback(async () => {
    if (!chatUuid) return

    console.log('[useDevServer] Starting dev server for:', chatUuid)
    setDevServerStatus(chatUuid, 'starting')
    setDevServerError(chatUuid, null)

    try {
      const result = await invokeStartDevServer({ chatUuid, customWorkspacePath: currentWorkspacePath })

      if (result.success) {
        console.log('[useDevServer] Dev server started successfully')
        // Poll for status until port is detected or error occurs
        pollDevServerStatus()
      } else {
        console.error('[useDevServer] Failed to start dev server:', result.error)
        setDevServerStatus(chatUuid, 'error')
        setDevServerError(chatUuid, result.error || 'Failed to start development server')
      }
    } catch (error: any) {
      console.error('[useDevServer] Error starting dev server:', error)
      setDevServerStatus(chatUuid, 'error')
      setDevServerError(chatUuid, error.message || 'Failed to start development server')
    }
  }, [chatUuid, currentWorkspacePath, setDevServerStatus, setDevServerError, pollDevServerStatus])

  // Stop development server
  const handleStopDevServer = useCallback(async () => {
    if (!chatUuid) return

    console.log('[useDevServer] Stopping dev server for:', chatUuid)

    try {
      const result = await invokeStopDevServer({ chatUuid })

      if (result.success) {
        console.log('[useDevServer] Dev server stopped successfully')
        setDevServerStatus(chatUuid, 'idle')
        setDevServerPort(chatUuid, null)
        setDevServerError(chatUuid, null)

        toast.success('Server Stopped', {
          description: 'Development server stopped successfully'
        })
      } else {
        console.error('[useDevServer] Failed to stop dev server:', result.error)
        toast.error('Error', {
          description: result.error || 'Failed to stop development server'
        })
      }
    } catch (error: any) {
      console.error('[useDevServer] Error stopping dev server:', error)
      toast.error('Error', {
        description: error.message || 'Failed to stop development server'
      })
    }
  }, [chatUuid, currentWorkspacePath, setDevServerStatus, setDevServerPort, setDevServerError])

  // Restart development server
  const handleRestartDevServer = useCallback(async () => {
    if (!chatUuid) return

    console.log('[useDevServer] Restarting dev server for:', chatUuid)

    // First stop the server
    try {
      await invokeStopDevServer({ chatUuid })
      setDevServerStatus(chatUuid, 'idle')
      setDevServerPort(chatUuid, null)
      setDevServerError(chatUuid, null)

      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 500))

      // Then start it again
      handleStartDevServer()

      toast('Restarting Server', {
        description: 'Development server is being restarted...'
      })
    } catch (error: any) {
      console.error('[useDevServer] Error restarting dev server:', error)
      toast.error('Error', {
        description: error.message || 'Failed to restart development server'
      })
    }
  }, [chatUuid, handleStartDevServer, setDevServerStatus, setDevServerPort, setDevServerError])

  // Check for preview.sh when component mounts
  useEffect(() => {
    checkForPreviewSh()
  }, [checkForPreviewSh])

  // Clean up dev server when workspace changes or component unmounts
  useEffect(() => {
    return () => {
      const status = devServerStatusRef.current
      console.log('[useDevServer] Cleanup triggered - chatUuid:', chatUuid, 'status:', status)

      if (chatUuid && status !== 'idle' && status !== 'stopped') {
        console.log('[useDevServer] Component unmounting or workspace changed, stopping dev server for:', chatUuid)

        // Immediately update store to prevent re-mounting issues
        setDevServerStatus(chatUuid, 'stopped')
        setDevServerPort(chatUuid, null)
        setDevServerError(chatUuid, null)

        // Call backend to actually stop the process
        invokeStopDevServer({ chatUuid }).then(result => {
          console.log('[useDevServer] Stop dev server result:', result)
        }).catch(err => {
          console.error('[useDevServer] Error stopping dev server:', err)
        })
      } else {
        console.log('[useDevServer] Skip cleanup - chatUuid:', chatUuid, 'status:', status)
      }
    }
  }, [chatUuid, currentWorkspacePath, setDevServerStatus, setDevServerPort, setDevServerError])

  return {
    hasPreviewSh,
    showErrorLogs,
    setShowErrorLogs,
    devServerStatus: currentDevServerStatus,
    devServerPort: currentDevServerPort,
    devServerError: currentDevServerError,
    devServerLogs: currentDevServerLogs,
    handleStartDevServer,
    handleStopDevServer,
    handleRestartDevServer
  }
}
