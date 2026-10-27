import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function CameraIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2c.5 0 1-.25 1.3-.68l.6-.9c.3-.4.8-.62 1.3-.62h2.4c.5 0 1 .23 1.3.63l.6.9c.3.42.8.67 1.3.67h1.0A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </Base>
  )
}

export function ChatIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M20 12.4c0 3.7-3.6 6.7-8 6.7-.9 0-1.8-.1-2.6-.35L4.6 20l1.1-3.2C4.4 15.5 4 14 4 12.4 4 8.7 7.6 5.7 12 5.7s8 3 8 6.7Z" />
    </Base>
  )
}

export function StoryIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.6" strokeDasharray="2.4 3.2" />
      <path d="M10.4 9.2l4.4 2.8-4.4 2.8z" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function PersonIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8.6" r="3.6" />
      <path d="M5.2 19.2c.9-3 3.5-4.7 6.8-4.7s5.9 1.7 6.8 4.7" />
    </Base>
  )
}

export function SendIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.5 12.3 19.4 5.6a.4.4 0 0 1 .53.53L13.2 20.1a.4.4 0 0 1-.75-.05l-1.5-5.2-5.4-1.6a.4.4 0 0 1-.05-.75Z" />
    </Base>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Base>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Base>
  )
}

export function BackIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Base>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </Base>
  )
}

export function FlameIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12.4 2.1c.3-.3.8-.1.8.3.1 2.6.9 4 2.3 5.6 1.6 1.9 3.1 3.6 3.1 6.4 0 4.2-3.2 7.5-7 7.5s-7-3.1-7-7.2c0-1.9.7-3.2 1.6-4.4.3-.4.9-.2.9.3 0 1 .3 1.7.8 2.1.6-2.9.5-6.6 4.5-10.6Z" />
    </svg>
  )
}

export function TimerIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="13" r="7.4" />
      <path d="M12 9.4V13l2.4 1.6M9.4 3.2h5.2" />
    </Base>
  )
}

export function FlipIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.6 9.2a7.6 7.6 0 0 1 12.9-2.1L20 9.6M19.4 14.8A7.6 7.6 0 0 1 6.5 16.9L4 14.4" />
      <path d="M20 5.6v4h-4M4 18.4v-4h4" />
    </Base>
  )
}

export function PhoneIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6.2 4.6h2.3l1.3 3.2-1.7 1.3a10.4 10.4 0 0 0 5.5 5.5l1.3-1.7 3.2 1.3v2.3c0 .9-.8 1.7-1.7 1.6C10.2 18 6 13.8 4.6 6.3c-.1-.9.7-1.7 1.6-1.7Z" />
    </Base>
  )
}

export function VideoIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.4" y="6.6" width="11.4" height="10.8" rx="2.6" />
      <path d="M14.8 11l5.3-3.1v8.2L14.8 13z" />
    </Base>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="6.4" />
      <path d="M15.8 15.8 20 20" />
    </Base>
  )
}

export function BookmarkIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 4.6h10a1 1 0 0 1 1 1v14.2l-6-3.9-6 3.9V5.6a1 1 0 0 1 1-1Z" />
    </Base>
  )
}

export function GridIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4.4" y="4.4" width="6.2" height="6.2" rx="1.4" />
      <rect x="13.4" y="4.4" width="6.2" height="6.2" rx="1.4" />
      <rect x="4.4" y="13.4" width="6.2" height="6.2" rx="1.4" />
      <rect x="13.4" y="13.4" width="6.2" height="6.2" rx="1.4" />
    </Base>
  )
}

export function EyeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2.9 12.2C4.9 8.6 8.2 6.6 12 6.6s7.1 2 9.1 5.6c-2 3.6-5.3 5.6-9.1 5.6s-7.1-2-9.1-5.6Z" />
      <circle cx="12" cy="12.2" r="2.7" />
    </Base>
  )
}

export function RepeatIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.6 10.4A7.5 7.5 0 0 1 18 7.3l1.8 1.9M19.4 13.6A7.5 7.5 0 0 1 6 16.7l-1.8-1.9" />
      <path d="M19.8 4.9v4.3h-4.3M4.2 19.1v-4.3h4.3" />
    </Base>
  )
}

export function ImageIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.6" y="5" width="16.8" height="14" rx="2.6" />
      <circle cx="8.6" cy="9.8" r="1.5" />
      <path d="M4.4 17.2l4.6-4.2 3.4 3 2.7-2.4 4.5 4" />
    </Base>
  )
}

export function BoltIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M13.4 3.2 5.9 13.4h4.8l-1.1 7.4 7.5-10.2h-4.8z" />
    </Base>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </Base>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.8 7.2h14.4M9.6 7.2V5.4a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1v1.8" />
      <path d="M6.6 7.2l.8 11.4a1.4 1.4 0 0 0 1.4 1.3h6.4a1.4 1.4 0 0 0 1.4-1.3l.8-11.4" />
    </Base>
  )
}
