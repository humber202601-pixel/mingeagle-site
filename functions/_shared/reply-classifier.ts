export type ReplyClassification = {
  intent: string;
  leadStatus: string;
  nextBestAction: string;
  taskTitle: string;
  taskDescription: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  suggestedReply: string;
};

export function classifyReply(body: string): ReplyClassification {
  const text = body.toLowerCase();
  const has = (...words: string[]) => words.some(word => text.includes(word));

  if (has('unsubscribe', 'remove me', 'stop emailing', 'do not contact', "don't contact", 'opt out', '取消订阅', '不要联系')) {
    return { intent: 'DO_NOT_CONTACT', leadStatus: 'DO_NOT_CONTACT', nextBestAction: 'Do not contact', taskTitle: '', taskDescription: '', priority: 'LOW', suggestedReply: 'Understood. We will not contact you again. Thank you for letting us know.' };
  }
  if (has('not interested', 'no thanks', 'no thank you', 'not for us', 'pass for now', 'not a fit', '不感兴趣')) {
    return { intent: 'NOT_INTERESTED', leadStatus: 'NOT_INTERESTED', nextBestAction: 'No further sales follow-up', taskTitle: '', taskDescription: '', priority: 'LOW', suggestedReply: 'Thank you for letting us know. We appreciate your time, and we will keep the door open if your needs change in the future.' };
  }
  if (has('sample', 'try one', 'try it', 'test one', 'demo', '样品', '试用')) {
    return { intent: 'SAMPLE_INTEREST', leadStatus: 'SAMPLE', nextBestAction: 'Confirm sample requirements and shipping details', taskTitle: 'Confirm sample request', taskDescription: 'Customer mentioned a sample or product trial. Confirm quantity, shipping address and sample terms.', priority: 'HIGH', suggestedReply: 'Thanks for your interest. We can discuss a sample. Please send the preferred ball size/quantity and your shipping ZIP code, and we will confirm the best sample option and delivery cost.' };
  }
  if (has('quote', 'quotation', 'price', 'pricing', 'cost', 'how much', 'wholesale', '报价', '价格', '批发')) {
    return { intent: 'PRICE_QUOTE', leadStatus: 'QUOTE', nextBestAction: 'Prepare pricing or quotation', taskTitle: 'Prepare customer quotation', taskDescription: 'Customer asked about pricing or a quotation. Confirm quantity, configuration and destination before quoting.', priority: 'HIGH', suggestedReply: 'Absolutely. We can prepare a wholesale quote. Please confirm the quantity you are considering and the delivery ZIP code. If you need a logo or custom configuration, please include that as well.' };
  }
  if (has('discount', 'better price', 'best price', 'payment terms', 'shipping terms', 'lead time', 'delivery time', 'negotiate', 'negotiation', '折扣', '交期', '付款条件')) {
    return { intent: 'NEGOTIATION', leadStatus: 'NEGOTIATION', nextBestAction: 'Respond to commercial questions and close the order', taskTitle: 'Respond to commercial questions', taskDescription: 'Customer is discussing price, payment, shipping or lead time. Review terms and respond.', priority: 'HIGH', suggestedReply: 'Thanks — I can review the commercial terms with you. Please confirm the target quantity and delivery location, and I will check the best available price, shipping option and lead time.' };
  }
  if (has('interested', 'sounds good', 'yes', 'let us try', "let's try", 'want to buy', 'place an order', 'ready to order', '感兴趣', '想购买', '下单')) {
    return { intent: 'INTERESTED', leadStatus: 'INTERESTED', nextBestAction: 'Confirm buying requirements and move to sample or quote', taskTitle: 'Follow up interested customer', taskDescription: 'Customer expressed positive buying intent. Confirm quantity, use case and delivery location.', priority: 'HIGH', suggestedReply: 'Great, thank you. To recommend the best option, please confirm the quantity you are considering and your delivery ZIP code. We can then confirm pricing and the fastest next step.' };
  }

  return { intent: 'GENERAL_REPLY', leadStatus: 'REPLIED', nextBestAction: 'Review customer reply and respond', taskTitle: 'Reply to customer message', taskDescription: 'Customer replied. Review the message and send the appropriate response.', priority: 'MEDIUM', suggestedReply: 'Thank you for your reply. I would be happy to help. Please share any quantity, product or delivery requirements you have, and I will confirm the best next step.' };
}
