import { useEffect, useState } from 'react'
import { Card, Rate, Typography, Empty, Skeleton, Tag, Space, Divider } from 'antd'
import { marketApi } from '../api/client'
import type { Review } from '../types/api'

const { Title, Text, Paragraph } = Typography

/**
 * Public review feed for an Agent or Skill detail page. Renders:
 *   - Header: average rating + total count
 *   - List: visible reviews (newest first), one card per row
 * Hidden reviews are filtered out server-side; this component just renders
 * what /market/{agents|skills}/{id}/reviews returns.
 */
export default function ReviewSection({
  listingType,
  listingId,
  averageRating,
  reviewCount,
}: {
  listingType: 'AGENT' | 'SKILL'
  listingId: number
  /** From listing view — falls back to recomputing from the fetched feed. */
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
    <Card style={{ marginTop: 16 }}>
      <Space align="center" size="middle" wrap>
        <Title level={4} style={{ margin: 0 }}>
          Buyer reviews
        </Title>
        {numericAverage != null && !Number.isNaN(numericAverage) ? (
          <Space size="small">
            <Rate disabled allowHalf value={numericAverage} style={{ fontSize: 18 }} />
            <Text strong>{averageRating}</Text>
            <Text type="secondary">/ 5</Text>
            <Text type="secondary">· {reviewCount} review{reviewCount === 1 ? '' : 's'}</Text>
          </Space>
        ) : (
          <Text type="secondary">No reviews yet</Text>
        )}
      </Space>

      <Divider style={{ margin: '12px 0' }} />

      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : error ? (
        <Text type="danger">{error}</Text>
      ) : reviews.length === 0 ? (
        <Empty
          description="Be the first to leave a review after your order is delivered."
          imageStyle={{ height: 80 }}
        />
      ) : (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {reviews.map((r) => (
            <ReviewRow key={r.id} review={r} />
          ))}
        </Space>
      )}
    </Card>
  )
}

function ReviewRow({ review }: { review: Review }) {
  return (
    <Card size="small" style={{ background: '#fafafa' }}>
      <Space align="center" size="small">
        <Rate disabled value={review.rating} style={{ fontSize: 14 }} />
        <Tag>{review.rating} / 5</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Buyer #{review.buyerId} · {new Date(review.createdAt).toLocaleDateString()}
        </Text>
      </Space>
      {review.comment && (
        <Paragraph style={{ marginTop: 8, marginBottom: 0, whiteSpace: 'pre-wrap' }}>
          {review.comment}
        </Paragraph>
      )}
    </Card>
  )
}
