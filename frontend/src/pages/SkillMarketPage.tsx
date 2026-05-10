import { useEffect, useState } from 'react'
import {
  Card, Col, Row, Tag, Typography, Button, Space, Badge, Spin, Empty,
} from 'antd'
import {
  StarFilled,
  ShoppingCartOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
  SyncOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { marketApi } from '../api/client'
import ManualPayModal from '../components/ManualPayModal'
import type { SkillListing, BuySkillResponse } from '../types/api'

const { Title, Text, Paragraph } = Typography

const CARD_COLORS = ['#fa8c16', '#13c2c2', '#eb2f96', '#722ed1', '#52c41a', '#2f54eb', '#d4b106', '#cf1322']


export default function SkillMarketPage() {
  const { hasWallet } = useAuthStore()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const [skills, setSkills] = useState<SkillListing[]>([])
  const [ownedIds, setOwnedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [buyInfo, setBuyInfo] = useState<BuySkillResponse | null>(null)
  const [buyingId, setBuyingId] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [data, orders] = await Promise.all([
        marketApi.skills(),
        marketApi.myOrders().catch(() => []),
      ])
      setSkills(data)
      setOwnedIds(
        new Set(
          orders
            .filter((o) => o.orderType === 'SKILL' && o.status !== 'refunded')
            .map((o) => o.listingId),
        ),
      )
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleBuy = async (skillId: number) => {
    if (!hasWallet()) {
      message.warning('请先绑定钱包 / Please connect your wallet first')
      navigate('/settings/wallet')
      return
    }
    setBuyingId(skillId)
    try {
      const info = await marketApi.buySkill(skillId)
      setBuyInfo(info)
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to create order')
    } finally {
      setBuyingId(null)
    }
  }

  return (
    <div>
      <div style={styles.hero}>
        <div>
          <Title style={{ color: '#fff', fontSize: 36, marginBottom: 12 }}>
            Skill Market
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.78)', fontSize: 16, marginBottom: 20 }}>
            一次性买断 Agent 配方、提示词包、工作流模板。
            <br />
            付款后写入链上托管，下载即拥有终身使用权。
          </Paragraph>
          <Space size="middle">
            <Tag icon={<StarFilled />} color="gold" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 999 }}>
              一次买断 · Lifetime
            </Tag>
            <Tag icon={<SafetyCertificateOutlined />} color="blue" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 999 }}>
              链上托管
            </Tag>
          </Space>
        </div>
      </div>

      {!hasWallet() && (
        <div style={styles.notice}>
          <WalletOutlined style={{ fontSize: 18, marginRight: 8 }} />
          <Text>Connect your OKX wallet to purchase skills.</Text>
          <Button
            type="primary"
            size="small"
            style={{ marginLeft: 16 }}
            onClick={() => navigate('/settings/wallet')}
          >
            Connect Wallet
          </Button>
        </div>
      )}

      <div style={{ padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24, gap: 12 }}>
          <Title level={4} style={{ margin: 0 }}>
            Featured Skills
            <Badge count={skills.length} showZero style={{ marginLeft: 12, background: '#fa8c16' }} />
          </Title>
          <Tag color="gold">一次买断</Tag>
          <Button
            type="text"
            size="small"
            icon={<SyncOutlined />}
            onClick={load}
            style={{ marginLeft: 'auto' }}
          >
            Refresh
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <Spin size="large" />
          </div>
        ) : skills.length === 0 ? (
          <Empty description="No approved skills yet" style={{ padding: '64px 0' }} />
        ) : (
          <Row gutter={[20, 20]}>
            {skills.map((s, idx) => {
              const color = CARD_COLORS[idx % CARD_COLORS.length]
              const tags = s.tags ? s.tags.split(',').map(t => t.trim()).filter(Boolean) : []
              return (
                <Col xs={24} sm={12} lg={8} key={s.id}>
                  <Card hoverable style={styles.card} bodyStyle={{ padding: 0 }}>
                    <div style={{ ...styles.cardHeader, background: `linear-gradient(135deg, ${color}33, ${color}11)` }}>
                      <div style={{ ...styles.avatar, background: `linear-gradient(135deg, ${color}, ${color}99)` }}>
                        {s.name[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ display: 'block', fontSize: 15 }}>{s.name}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{s.category || '—'}</Text>
                      </div>
                    </div>

                    <div style={{ padding: '16px 20px' }}>
                      <Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }} ellipsis={{ rows: 2 }}>
                        {s.description}
                      </Paragraph>

                      {(s.serviceInput || s.serviceOutput) && (
                        <div style={{ marginBottom: 12, fontSize: 12, background: '#fff9f0', borderRadius: 8, padding: '8px 10px' }}>
                          {s.serviceInput && (
                            <div style={{ marginBottom: 4 }}>
                              <Text type="secondary">需要 / Requires: </Text>
                              <Text style={{ fontSize: 12 }}>{s.serviceInput.slice(0, 80)}{s.serviceInput.length > 80 ? '…' : ''}</Text>
                            </div>
                          )}
                          {s.serviceOutput && (
                            <div>
                              <Text type="secondary">交付 / Delivers: </Text>
                              <Text style={{ fontSize: 12 }}>{s.serviceOutput.slice(0, 80)}{s.serviceOutput.length > 80 ? '…' : ''}</Text>
                            </div>
                          )}
                        </div>
                      )}

                      {tags.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          {tags.map((t) => (
                            <Tag key={t} style={{ marginBottom: 4, fontSize: 11 }}>{t}</Tag>
                          ))}
                        </div>
                      )}

                      <div style={styles.cardFooter}>
                        <div>
                          <Text strong style={{ color: '#fa8c16', fontSize: 16 }}>{s.priceUsdt} USDT</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>Lifetime access</Text>
                        </div>
                        {ownedIds.has(s.id) ? (
                          <Button
                            type="primary"
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => navigate(`/market/skills/${s.id}`)}
                            style={{ borderRadius: 8 }}
                          >
                            View
                          </Button>
                        ) : (
                          <Button
                            type="primary"
                            size="small"
                            icon={<ShoppingCartOutlined />}
                            loading={buyingId === s.id}
                            onClick={() => handleBuy(s.id)}
                            style={{ borderRadius: 8, background: '#fa8c16', borderColor: '#fa8c16' }}
                          >
                            Buy
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                </Col>
              )
            })}
          </Row>
        )}
      </div>

      <ManualPayModal
        open={buyInfo !== null}
        info={buyInfo}
        kind="skill"
        onClose={() => setBuyInfo(null)}
        onSubmitted={load}
      />
    </div>
  )
}

const styles = {
  hero: {
    background: 'linear-gradient(135deg, #2c1810 0%, #6b3410 60%, #fa8c16 130%)',
    padding: '60px 32px',
  } as React.CSSProperties,
  notice: {
    background: '#fffbe6',
    border: '1px solid #ffe58f',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    height: '100%',
  } as React.CSSProperties,
  cardHeader: {
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  } as React.CSSProperties,
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 700,
    fontSize: 18,
    flexShrink: 0,
  } as React.CSSProperties,
  cardFooter: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  } as React.CSSProperties,
}
