import { Moon, Sun } from "lucide-react"

import { Button } from "@renderer/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu"
import { useTheme } from "@renderer/components/theme-provider"

export function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-8 p-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-lg bg-transparent hover:bg-gray-100 dark:hover:bg-white/7 transition-all duration-200 border border-transparent hover:border-gray-200 dark:hover:border-white/8 dark:hover:shadow-[0_6px_16px_-12px_rgba(255,255,255,0.35)]"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-gray-600 dark:text-gray-400" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-gray-600 dark:text-gray-400" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl bg-white/50 dark:bg-white/5 dark:text-gray-300 backdrop-blur-3xl">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="rounded-lg transition-colors data-highlighted:bg-gray-200 dark:data-highlighted:bg-white/8"
        >
          Light
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="rounded-lg transition-colors data-highlighted:bg-gray-200 dark:data-highlighted:bg-white/8"
        >
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="rounded-lg transition-colors data-highlighted:bg-gray-200 dark:data-highlighted:bg-white/8"
        >
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
