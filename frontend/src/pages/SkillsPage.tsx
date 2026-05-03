import { Card, Col, Row, Tag, Typography, Button, Space, Badge } from 'antd'
import {
  StarFilled,
  ShoppingCartOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const { Title, Text, Paragraph } = Typography

const DEMO_SKILLS = [
  {
    id: 'prompt-pack-trading',
    name: 'Pro Trading Prompt Pack',
    category: '提示词包 / Prompts',
    desc: '资深量化团队整理的 80+ 加密货币交易分析提示词，覆盖技术面、链上、宏观。一次买断，终身使用。',
    price: '49 USDT',
    rating: 4.9,
    sales: 217,
    tags: ['Prompts', 'Trading', 'Lifetime'],
    color: '#fa8c16',
  },
  {
    id: 'agent-recipe-customer',
    name: 'Customer Support Agent Recipe',
    category: 'Agent 配方 / Recipe',
    desc: '完整的客服 Agent 配置：YAML 角色 + 工具集成 + RAG 检索模板，开箱即用。',
    price: '99 USDT',
    rating: 4.8,
    sales: 134,
    tags: ['Recipe', 'Customer', 'Lifetime'],
    color: '#13c2c2',
  },
  {
    id: 'workflow-marketing',
    name: 'Marketing Content Workflow',
    category: '工作流 / Workflow',
    desc: '6 步从主题→大纲→文案→SEO→封面图→排期的端到端营销工作流，已对接 Notion / Slack。',
    price: '79 USDT',
    rating: 4.7,
    sales: 89,
    tags: ['Workflow', 'Marketing', 'Lifetime'],
    color: '#eb2f96',
  },
  {
    id: 'finetune-recipe',
    name: 'LoRA Fine-tune Recipe',
    category: '微调配方 / Fine-tune',
    desc: '小模型 LoRA 微调脚本 + 数据处理模板 + 评估流程，10 美金算力即可跑通。',
    price: '149 USDT',
    rating: 4.9,
    sales: 56,
    tags: ['LoRA', 'Training', 'Lifetime'],
    color: '#722ed1',
  },
  {
    id: 'voice-clone-skill',
    name: 'Voice Clone Skill',
    category: '语音 / Voice',
    desc: '一键语音克隆技能包，3 秒样本生成自然语音，支持 12 种语言。',
    price: '69 USDT',
    rating: 4.6,
    sales: 312,
    tags: ['Voice', 'Skill', 'Lifetime'],
    color: '#52c41a',
  },
  {
    id: 'rag-template-finance',
    name: 'Financial RAG Template',
    category: 'RAG 模板',
    desc: '金融报告 RAG 模板，含数据切分策略、向量检索、引用追溯，对接主流向量库。',
    price: '129 USDT',
    rating: 4.8,
    sales: 41,
    tags: ['RAG', 'Finance', 'Lifetime'],
    color: '#2f54eb',
  },
]

export default function SkillsPage() {
  const { hasWallet } = useAuthStore()
  const navigate = useNavigate()

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
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <Title level={4} style={{ margin: 0 }}>
            Featured Skills
            <Badge count={DEMO_SKILLS.length} style={{ marginLeft: 12, background: '#fa8c16' }} />
          </Title>
          <Tag color="gold" style={{ marginLeft: 12 }}>一次买断</Tag>
        </div>

        <Row gutter={[20, 20]}>
          {DEMO_SKILLS.map((s) => (
            <Col xs={24} sm={12} lg={8} key={s.id}>
              <Card hoverable style={styles.card} bodyStyle={{ padding: 0 }}>
                <div style={{ ...styles.cardHeader, background: `linear-gradient(135deg, ${s.color}33, ${s.color}11)` }}>
                  <div style={{ ...styles.avatar, background: `linear-gradient(135deg, ${s.color}, ${s.color}99)` }}>
                    {s.name[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ display: 'block', fontSize: 15 }}>{s.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{s.category}</Text>
                  </div>
                </div>

                <div style={{ padding: '16px 20px' }}>
                  <Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }} ellipsis={{ rows: 2 }}>
                    {s.desc}
                  </Paragraph>

                  <div style={{ marginBottom: 12 }}>
                    {s.tags.map((t) => (
                      <Tag key={t} style={{ marginBottom: 4, fontSize: 11 }}>{t}</Tag>
                    ))}
                  </div>

                  <div style={styles.cardFooter}>
                    <div>
                      <Text strong style={{ color: '#fa8c16', fontSize: 16 }}>{s.price}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        <StarFilled style={{ color: '#faad14', marginRight: 4 }} />
                        {s.rating} · {s.sales} sold
                      </Text>
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
          ))}
        </Row>
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
