/* Значок виртуальной работы в стиле карточек каталога AI edu */
import { Bot, BookOpen, CalendarRange, Clapperboard, FileText, Images, Library, ListChecks, Presentation, School, ShieldCheck, Sparkles, Users, Wrench, FlaskConical } from 'lucide-react'

const ICONS: Record<string, typeof BookOpen> = {
  vw01: BookOpen, vw02: Wrench, vw03: Users, vw04: CalendarRange, vw05: Presentation, vw06: Clapperboard, vw07: Library,
  vw08: FileText, vw09: Bot, vw10: ListChecks, vw11: School, vw12: Images, vw13: Sparkles, vw14: ShieldCheck,
}

export function WorkIcon({ code, size = 24 }: { code: string; size?: number }) {
  const Icon = ICONS[code] ?? FlaskConical
  const tone = Number(code.slice(2)) % 3
  return <span className={`catalog-card-art vl-work-icon tone-${tone}`} aria-hidden="true"><Icon size={size}/></span>
}
