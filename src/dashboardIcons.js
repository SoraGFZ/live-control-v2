import {
  AudioLines,
  Bot,
  Cloud,
  Gamepad2,
  Gift,
  House,
  LayoutGrid,
  LayoutTemplate,
  MessageCircleHeart,
  Radio,
  Swords,
  Target,
  Users,
  Volume2,
  Sparkles,
  Calendar,
  Building2,
  UserCircle,
  FolderOpen,
} from 'lucide-react'

export const SECTION_ICON_MAP = {
  overview: House,
  'live-hub': Radio,
  'live-ops': Radio,
  actions: Sparkles,
  sounds: Volume2,
  tts: AudioLines,
  'widgets-gallery': LayoutGrid,
  overlay: LayoutTemplate,
  music: AudioLines,
  'gifts-hub': Gift,
  goals: Target,
  community: Users,
  battles: Swords,
  games: Gamepad2,
  events: Calendar,
  agencies: Building2,
  account: UserCircle,
  bridges: Bot,
  storage: Cloud,
  profiles: FolderOpen,
  emotes: MessageCircleHeart,
}

export function getSectionIcon(sectionId) {
  return SECTION_ICON_MAP[sectionId] || Sparkles
}
