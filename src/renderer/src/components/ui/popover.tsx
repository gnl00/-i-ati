import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@renderer/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const getInteractionTarget = (event: {
  target?: EventTarget | null
  detail?: {
    originalEvent?: Event
  }
}): EventTarget | null => {
  return event.detail?.originalEvent?.target ?? event.target ?? null
}

const isSelectPortalTarget = (target: EventTarget | null): boolean => {
  return target instanceof Element && target.closest('[data-select-content]') !== null
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    portalContainer?: HTMLElement | null
  }
>(({ className, align = "center", sideOffset = 4, portalContainer, onInteractOutside, onPointerDownOutside, onFocusOutside, ...props }, ref) => (
  <PopoverPrimitive.Portal container={portalContainer ?? undefined}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      onInteractOutside={(event) => {
        if (isSelectPortalTarget(getInteractionTarget(event))) {
          event.preventDefault()
          return
        }
        onInteractOutside?.(event)
      }}
      onPointerDownOutside={(event) => {
        if (isSelectPortalTarget(getInteractionTarget(event))) {
          event.preventDefault()
          return
        }
        onPointerDownOutside?.(event)
      }}
      onFocusOutside={(event) => {
        if (isSelectPortalTarget(getInteractionTarget(event))) {
          event.preventDefault()
          return
        }
        onFocusOutside?.(event)
      }}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }
