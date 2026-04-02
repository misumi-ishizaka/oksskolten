import { useState } from 'react'
import { useI18n } from '../../lib/i18n'

interface SummaryInlineProps {
  summary: string | null
}

export function SummaryInline({ summary }: SummaryInlineProps) {
  const [expanded, setExpanded] = useState(true)
  const { t } = useI18n()

  if (!summary) return null

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setExpanded(prev => !prev)
        }}
        className="flex items-center gap-1 text-[11px] text-accent select-none hover:underline"
      >
        <span>{t('article.autoSummary')}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="currentColor"
          className={`transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M5 6.5L1 2.5h8L5 6.5z" />
        </svg>
      </button>
      {expanded && (
        <p
          className="text-[12px] text-muted mt-1 whitespace-pre-wrap line-clamp-6 leading-relaxed"
          onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
        >
          {summary}
        </p>
      )}
    </div>
  )
}
