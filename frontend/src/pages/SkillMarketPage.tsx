import { useEffect, useState } from 'react'
import { Card, Col, Row, Tag, Typography, Button, Space, Badge, Spin, Empty } from 'antd'
import {
  StarFilled,
  ShoppingCartOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { marketApi } from '../api/client'
import type { SkillListing } from '../types/api'

const { Title, Text, Paragraph } = Typography

const CARD_COLORS = ['#fa8c16', '#13c2c2', '#eb2f96', '#722ed1', '#52c41a', '#2f54eb', '#d4b106', '#cf1322']

const DEMO_SKILLS: SkillListing[] = [
  { id: -1, merchantId: 0, name: 'Pro Trading Prompt Pack', description: '资深量化团队整理的 80+ 加密货币交易分析提示词，覆盖技术面、链上、宏观。一次买断，终身使用。', category: '提示词包 / Prompts', priceUsdt: '49', downloadUrl: null, tags: 'Prompts,Trading,Lifetime', status: 'approved', reviewReason: null, reviewedAt: null, createdAt: '', updatedAt: '' },
  { id: -2, merchantId: 0, name: 'Customer Support Agent Recipe', description: '完整的客服 Agent 配置：YAML 角色 + 工具集成 + RAG 检索模板，开箱即用。', category: 'Agent 配方 / Recipe', priceUsdt: '99', downloadUrl: null, tags: 'Recipe,Customer,Lifetime', status: 'approved', reviewReason: null, reviewedAt: null, createdAt: '', updatedAt: '' },
  { id: -3, merchantId: 0, name: 'Marketing Content Workflow', description: '6 步从主题→大纲→文案→SEO→封面图→排期的端到端营销工作流，已对接 Notion / Slack。', category: '工作流 / Workflow', priceUsdt: '79', downloadUrl: null, tags: 'Workflow,Marketing,Lifetime', status: 'approved', reviewReason: null, reviewedAt: null, createdAt: '', updatedAt: '' },
  { id: -4, merchantId: 0, name: 'LoRA Fine-tune Recipe', description: '小模型 LoRA 微调脚本 + 数据处理模板 + 评估流程，10 美金算力即可跑通。', category: '微调配方 / Fine-tune', priceUsdt: '149', downloadUrl: null, tags: 'LoRA,Training,Lifetime', status: 'approved', reviewReason: null, reviewedAt: null, createdAt: '', updatedAt: '' },
  { id: -5, merchantId: 0, name: 'Voice Clone Skill', description: '一键语音克隆技能包，3 秒样本生成自然语音，支持 12 种语言。', category: '语音 / Voice', priceUsdt: '69', downloadUrl: null, tags: 'Voice,Skill,Lifetime', status: 'approved', reviewReason: null, reviewedAt: null, createdAt: '', updatedAt: '' },
  { id: -6, merchantId: 0, name: 'Financial RAG Template', description: '金融报告 RAG 模板，含数据切分策略、向量检索、引用追溯，对接主流向量库。', category: 'RAG 模板', priceUsdt: '129', downloadUrl: null, tags: 'RAG,Finance,Lifetime', status: 'approved', reviewReason: null, reviewedAt: null, createdAt: '', updatedAt: '' },
]

export default function SkillMarketPage() {
  const { hasWallet } = useAuthStore()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()
  const [skills, setSkills] = useState<SkillListing[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await marketApi.skills()
      setSkills([...data, ...DEMO_SKILLS])
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to load skills')
      setSkills([...DEMO_SKILLS])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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
                        <Button
                          type="primary"
                          size="small"
                          icon={<ShoppingCartOutlined />}
                          disabled={!hasWallet()}
                          title={!hasWallet() ? 'Connect wallet first' : ''}
                          style={{ borderRadius: 8, background: '#fa8c16', borderColor: '#fa8c16' }}
                        >
                          Buy
                        </Button>
                      </div>
                    </div>
                  </Card>
                </Col>
              )
            })}
          </Row>
        )}
      </div>
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
