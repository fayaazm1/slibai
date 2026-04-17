// Predefined avatar list — users pick one of these, no file upload needed.
// Each avatar has a unique id (stored in DB), an emoji, background color, and label.

export interface PresetAvatar {
  id: string
  emoji: string
  bg: string        // Tailwind bg class
  ring: string      // Tailwind ring color for selected state
  label: string
}

export const PRESET_AVATARS: PresetAvatar[] = [
  { id: 'robot',      emoji: '🤖', bg: 'bg-blue-600',    ring: 'ring-blue-400',    label: 'Robot'      },
  { id: 'fox',        emoji: '🦊', bg: 'bg-orange-500',  ring: 'ring-orange-400',  label: 'Fox'        },
  { id: 'dragon',     emoji: '🐉', bg: 'bg-purple-600',  ring: 'ring-purple-400',  label: 'Dragon'     },
  { id: 'astronaut',  emoji: '🧑‍🚀', bg: 'bg-indigo-600',  ring: 'ring-indigo-400',  label: 'Astronaut'  },
  { id: 'wizard',     emoji: '🧙', bg: 'bg-violet-600',  ring: 'ring-violet-400',  label: 'Wizard'     },
  { id: 'ninja',      emoji: '🥷', bg: 'bg-slate-600',   ring: 'ring-slate-400',   label: 'Ninja'      },
  { id: 'alien',      emoji: '👾', bg: 'bg-green-600',   ring: 'ring-green-400',   label: 'Alien'      },
  { id: 'cat',        emoji: '🐱', bg: 'bg-yellow-600',  ring: 'ring-yellow-400',  label: 'Cat'        },
  { id: 'wolf',       emoji: '🐺', bg: 'bg-gray-600',    ring: 'ring-gray-400',    label: 'Wolf'       },
  { id: 'panda',      emoji: '🐼', bg: 'bg-teal-600',    ring: 'ring-teal-400',    label: 'Panda'      },
  { id: 'lion',       emoji: '🦁', bg: 'bg-amber-600',   ring: 'ring-amber-400',   label: 'Lion'       },
  { id: 'phoenix',    emoji: '🦅', bg: 'bg-red-600',     ring: 'ring-red-400',     label: 'Eagle'      },
]

// Default avatar shown when user hasn't selected one yet
export const DEFAULT_AVATAR: PresetAvatar = {
  id: 'default',
  emoji: '👤',
  bg: 'bg-zinc-600',
  ring: 'ring-zinc-400',
  label: 'Default',
}

// Resolve an avatar id string to a PresetAvatar object
export function getAvatar(avatarId: string | null | undefined): PresetAvatar {
  if (!avatarId) return DEFAULT_AVATAR
  return PRESET_AVATARS.find(a => a.id === avatarId) ?? DEFAULT_AVATAR
}
