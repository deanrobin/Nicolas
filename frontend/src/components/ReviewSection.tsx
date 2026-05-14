import { useEffect, useState } from 'react'
import { Rate } from 'antd'
import { marketApi } from '../api/client'
import type { Review } from '../types/api'
import { DetailPanel } from './nicolas/market'

/**
 * Public review feed for an Agent or Skill detail page, rendered in the
 * alchemy theme. Header carries the avg rating + count; the body is one
 * dim mono-tagged row per review (newest first). Hidden reviews are
 * filtered out server-side.
 */
export default function ReviewSection({
  listingType,
  listingId,
  averageRating,
  reviewCount,
}: {
  listingType: 'AGENT' | 'SKILL'
  listingId: number
  /** From listing view — same value as below in the header. */
  averageRating: string | null
  reviewCount: number
}) {
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState<Review[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const fetcher =
      listingType === 'AGENT'
        ? marketApi.agentReviews(listingId)
        : marketApi.skillReviews(listingId)
    fetcher
      .then((rows) => {
        if (cancelled) return
        setReviews(rows)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load reviews')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [listingType, listingId])

  const numericAverage = averageRating != null ? Number(averageRating) : null

  return (
    <div style={{ marginTop: 24 }}>
      <DetailPanel title="Buyer reviews">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
          {numericAverage != null && !Number.isNaN(numericAverage) ? (
            <>
              <Rate
                disabled
                allowHalf
                value={numericAverage}
                style={{ fontSize: 18, color: 'var(--gold)' }}
              />
              <span className="nic-display" style={{ fontSize: 24, color: 'var(--parchment)' }}>
                {averageRating}
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                / 5 · {reviewCount} review{reviewCount === 1 ? '' : 's'}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--muted-strong)', fontSize: 13 }}>
              No reviews yet
            </span>
          )}
        </div>

        {loading ? (
          <div className="nic-mono" style={{ color: 'var(--muted)', fontSize: 12 }}>loading…</div>
        ) : error ? (
          <div style={{ color: 'var(--ember)', fontSize: 13 }}>{error}</div>
        ) : reviews.length === 0 ? (
          <div style={{
            border: '1px dashed var(--line-strong)',
            borderRadius: 12, padding: '24px 16px',
            textAlign: 'center', color: 'var(--muted-strong)', fontSize: 13,
          }}>
            <div className="nic-display" style={{ fontSize: 28, color: 'var(--gold-soft)', marginBottom: 6, fontStyle: 'italic' }}>✦</div>
            Be the first to leave a review after your order is delivered.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reviews.map((r) => (
              <ReviewRow key={r.id} review={r} />
            ))}
          </div>
        )}
      </DetailPanel>
    </div>
  )
}

function ReviewRow({ review }: { review: Review }) {
  return (
    <div style={{
      background: 'var(--ink)',
      border: '1px solid var(--line)',
      borderRadius: 12,
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Rate disabled value={review.rating} style={{ fontSize: 14, color: 'var(--gold)' }} />
        <span className="nic-mono" style={{ fontSize: 11, color: 'var(--gold-soft)' }}>
          {review.rating} / 5
        </span>
        <span className="nic-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
          buyer #{review.buyerId} · {new Date(review.createdAt).toLocaleDateString()}
        </span>
      </div>
      {review.comment && (
        <p style={{
          marginTop: 8, marginBottom: 0,
          color: 'var(--parchment)', fontSize: 13, lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}>
          {review.comment}
        </p>
      )}
    </div>
  )
}
