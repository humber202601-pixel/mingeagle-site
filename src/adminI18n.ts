export const statusLabel = (value: unknown) => {
  const key = String(value ?? '').trim().toUpperCase();
  const labels: Record<string, string> = {
    NEW: '新建', REVIEWING: '审核中', RESPONDED: '已回复', QUALIFIED: '已筛选合格',
    DISCOVERED: '已发现', ANALYZED: '已分析', ENRICHING: '信息补全中', READY_TO_CONTACT: '待联系',
    CONTACTED: '已联系', REPLIED: '已回复', INTERESTED: '有兴趣', SAMPLE: '样品阶段', QUOTE: '报价阶段',
    NEGOTIATION: '洽谈中', WON: '已成交', LOST: '已流失', NOT_FIT: '不匹配', NO_RESPONSE: '暂无回复',
    NOT_INTERESTED: '暂不感兴趣', DO_NOT_CONTACT: '禁止联系', CLOSED: '已关闭',
    PROSPECT: '潜在客户', CUSTOMER: '正式客户', PARTNER: '合作伙伴', ARCHIVED: '已归档',
    DRAFT: '草稿', SENT: '已发送', VIEWED: '客户已查看', ACCEPTED: '已接受', CONVERTED: '已转订单',
    EXPIRED: '已过期', DECLINED: '已拒绝', PAYMENT_PENDING: '待付款', UNPAID: '未付款', PARTIAL: '部分付款',
    PAID: '已付款', PROCESSING: '处理中', READY_TO_SHIP: '待发货', SHIPPED: '已发货', IN_TRANSIT: '运输中',
    DELIVERED: '已送达', COMPLETED: '已完成', CANCELLED: '已取消', OPEN: '待处理', IN_PROGRESS: '进行中',
    DONE: '已完成', RECEIVED: '已收款', REFUNDED: '已退款', FAILED: '失败', PREPARING: '准备中',
    EXCEPTION: '物流异常', RETURNED: '已退回', REQUESTED: '已申请', APPROVED: '已批准', FOLLOW_UP: '待跟进',
  };
  return labels[key] || (key || '—');
};

export const priorityLabel = (value: unknown) => {
  const key = String(value ?? '').trim().toUpperCase();
  const labels: Record<string, string> = { URGENT: '紧急', HIGH: '高', MEDIUM: '中', LOW: '低' };
  return labels[key] || (key || '—');
};

export const requestTypeLabel = (value: unknown) => {
  const key = String(value ?? '').trim().toUpperCase();
  const labels: Record<string, string> = { WHOLESALE: '批发询盘', SAMPLE: '样品申请' };
  return labels[key] || (key || '—');
};

export const customerTypeLabel = (value: unknown) => {
  const key = String(value ?? '').trim().toLowerCase();
  const labels: Record<string, string> = {
    academy: '培训机构 / 学院', 'coach / trainer': '教练 / 训练师', retailer: '零售商',
    'camp / program': '训练营 / 项目机构', distributor: '经销商', 'family / consumer': '家庭 / 个人消费者',
  };
  return labels[key] || (String(value ?? '').trim() || '—');
};

export const emailTypeLabel = (value: unknown) => {
  const key = String(value ?? '').trim().toUpperCase();
  const labels: Record<string, string> = {
    DIRECT_BUSINESS: '企业直联邮箱', ROLE_BASED: '岗位邮箱', GENERIC: '通用邮箱', PERSONAL: '个人邮箱',
    INFERRED: '推测邮箱', INVALID: '无效邮箱', UNKNOWN: '未知', BUSINESS: '企业邮箱', ROLE: '岗位邮箱',
  };
  return labels[key] || (key || '—');
};

export const activityTypeLabel = (value: unknown) => {
  const key = String(value ?? '').trim().toUpperCase();
  const labels: Record<string, string> = {
    INQUIRY_CREATED: '收到询盘', INQUIRY_RECEIVED: '收到询盘', QUOTE_DRAFT_CREATED: '创建报价草稿',
    REORDER_QUOTE_CREATED: '创建复购报价草稿', QUOTE_SENT: '报价已发送', QUOTE_VIEWED: '客户查看报价',
    QUOTE_ACCEPTED: '客户接受报价', PAYMENT_RECEIVED: '收到付款', PAYMENT_PARTIAL_RECEIVED: '收到部分付款',
    ORDER_PROCESSING: '订单开始处理', READY_TO_SHIP: '订单待发货', ORDER_SHIPPED: '订单已发货',
    ORDER_DELIVERED: '订单已送达', ORDER_COMPLETED: '订单已完成', TASK_STARTED: '任务开始',
    TASK_SNOOZED: '任务延期', TASK_COMPLETED: '任务完成', MESSAGE_INBOUND: '收到客户回复',
    MESSAGE_OUTBOUND: '已登记主动联系', AUTOMATION_FOLLOW_UP: '自动生成跟进任务',
  };
  return labels[key] || (key || '业务动态');
};

export const systemText = (value: unknown) => {
  let text = String(value ?? '').trim();
  if (!text) return '';

  const exact: Record<string, string> = {
    'Wholesale inquiry received': '收到批发询盘', 'Sample request received': '收到样品申请',
    'Quote draft created': '已创建报价草稿', 'Reorder quote draft created': '已创建复购报价草稿',
    'Quote sent': '报价已发送', 'Quote viewed': '客户已查看报价',
    'Quote accepted and order created': '客户已接受报价并生成订单', 'Payment received': '已收到付款',
    'Partial payment received': '已收到部分付款', 'Order processing started': '订单已开始处理',
    'Order ready to ship': '订单已准备发货', 'Order shipped': '订单已发货', 'Order delivered': '订单已送达',
    'Order completed': '订单已完成', 'Customer reply logged': '已登记客户回复',
    'Outbound message logged': '已登记主动联系', 'Automatic follow-up task created': '系统自动创建跟进任务',
    'Wait for reply / follow up': '等待客户回复并按计划跟进',
    'Do not contact': '禁止继续联系', 'No further sales follow-up': '停止后续销售跟进',
    'Confirm sample requirements and shipping details': '确认样品需求和收货信息',
    'Prepare pricing or quotation': '准备价格或报价单',
    'Respond to commercial questions and close the order': '回复商务问题并推进成交',
    'Confirm buying requirements and move to sample or quote': '确认采购需求并推进样品或报价',
    'Review customer reply and respond': '查看客户回复并进行回应',
  };
  if (exact[text]) return exact[text];

  const replacements: Array<[RegExp, string]> = [
    [/^Review wholesale inquiry (.+)$/i, '审核批发询盘 $1'], [/^Review sample request (.+)$/i, '审核样品申请 $1'],
    [/^Review and send quote (.+)$/i, '审核并发送报价 $1'], [/^Review reorder quote (.+)$/i, '审核复购报价 $1'],
    [/^Follow up quote (.+)$/i, '跟进报价 $1'], [/^Confirm payment for (.+)$/i, '确认订单 $1 的付款'],
    [/^Start processing (.+)$/i, '开始处理订单 $1'], [/^Prepare (.+) for shipment$/i, '准备订单 $1 发货'],
    [/^Ship (.+)$/i, '发出订单 $1'], [/^Check delivery (.+)$/i, '检查订单 $1 的配送状态'],
    [/^Reorder follow-up (.+)$/i, '复购跟进 $1'], [/^Follow up outreach$/i, '跟进主动开发客户'],
    [/^Confirm sample request$/i, '确认样品申请'], [/^Prepare customer quotation$/i, '准备客户报价'],
    [/^Respond to commercial questions$/i, '回复商务问题'], [/^Follow up interested customer$/i, '跟进高意向客户'],
    [/^Reply to customer message$/i, '回复客户消息'], [/^(.+) marked paid$/i, '$1 已确认全额付款'],
    [/^(.+) moved to PROCESSING$/i, '$1 已进入处理阶段'], [/^(.+) moved to READY_TO_SHIP$/i, '$1 已进入待发货状态'],
    [/^(.+) shipped via (.+)$/i, '$1 已通过 $2 发货'], [/^(.+) marked delivered$/i, '$1 已确认送达'],
    [/^(.+) moved to COMPLETED$/i, '$1 已完成'], [/^(.+) viewed by customer$/i, '客户已查看 $1'],
    [/^(.+) created from historical order (.+)$/i, '$1 已根据历史订单 $2 创建'],
    [/^(.+) created from (.+)$/i, '$1 由 $2 创建'], [/^(.+) accepted; (.+) created$/i, '$1 已被客户接受，并生成订单 $2'],
  ];
  for (const [pattern, replacement] of replacements) if (pattern.test(text)) return text.replace(pattern, replacement);
  return text;
};

export const zhDate = (value: unknown) => {
  if (!value) return '—';
  const raw = String(value);
  const parsed = new Date(raw.replace(' ', 'T') + (raw.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString('zh-CN', { hour12: false });
};
