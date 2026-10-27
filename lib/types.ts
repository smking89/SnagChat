// Shared client/server types. Keep this file free of server-only imports.

export type PublicUser = {
  id: string
  username: string
  displayName: string
  hue: number
  isDemo: boolean
}

/** Interactive overlay metadata carried with every snag. */
export type SnagPin = { x: number; y: number; emoji: string; scale?: number }
export type SnagLayout = { overlay: string; pins: SnagPin[]; captionY?: number }

export type SnagMeta = {
  palette: string[]
  dominantHue: number | null
  tags: string[]
  layout: SnagLayout | null
}

export type ChatPreview = {
  peer: PublicUser
  last: {
    kind: string
    body: string | null
    fromMe: boolean
    createdAt: number
    opened: boolean
    saved: boolean
  } | null
  unread: number
  streak: number
  savedCount: number
}

export type ThreadMessage = {
  id: string
  fromMe: boolean
  kind: string
  body: string | null
  createdAt: number
  snapId: string | null
  snapOpened: boolean
  snapDeleted: boolean
  snapDuration: number
  saved: boolean
  layout: SnagLayout | null
  palette: string[]
  expiresAt: number | null
}

export type Thread = {
  peer: PublicUser
  messages: ThreadMessage[]
  drawer: DrawerItem[]
}

export type DrawerItem = {
  snagId: string
  caption: string | null
  createdAt: number
  palette: string[]
  layout: SnagLayout | null
  fromMe: boolean
  messageId: string | null
}

export type FlashItem = {
  snagId: string
  sender: PublicUser
  caption: string | null
  createdAt: number
  expiresAt: number | null
  palette: string[]
  dominantHue: number | null
  layout: SnagLayout | null
  tags: string[]
  viewed: boolean
  mine: boolean
  parentSnagId: string | null
}

export type VaultSummary = {
  id: string
  title: string
  slug: string
  count: number
  cover: string | null
  updatedAt: number
}

export type VaultItem = {
  snagId: string
  caption: string | null
  mediaType: string
  createdAt: number
  palette: string[]
  layout: SnagLayout | null
  sender: PublicUser | null
  note: string | null
}

export type VaultDetail = {
  vault: VaultSummary
  items: VaultItem[]
}
