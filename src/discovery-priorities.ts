import {TYPE_OPTIONS} from '../shared/discovery';

export type BuyerSegment={
  category:string;total:number;withContact:number;contactable:number;emailReady:number;
  blocked:number;contacted:number;replied:number;quoted:number;ordered:number;paid:number;
  readyToReview:number;
};
export type PriorityLevel='MULTI_STAGE'|'REPLIES'|'BACKLOG'|'EXPLORATION'|'RETHINK';
export type Priority={
  category:string;label:string;level:PriorityLevel;
  total:number;contacted:number;replied:number;quoted:number;ordered:number;
  readyToReview:number;contactable:number;confidence:'OBSERVED'|'LIMITED'|'NONE';
  reason:string;nextAction:string;expandable:boolean;replyRate:number|null;
};
const integer=(n:unknown)=>Math.max(0,Math.floor(Number(n)||0));
const catalogOrder=new Map<string,number>(TYPE_OPTIONS.map(([key],index)=>[key,index]));
// A suggestion is not a sales prediction. Only actual matched CRM messages,
// non-draft quotations and non-cancelled orders can support positive feedback.
export function discoveryPriorities(segments:BuyerSegment[]):Priority[]{
  const byType=new Map(segments.map(s=>[s.category,s]));
  const options=TYPE_OPTIONS.map(([category,label]):Priority=>{
    const source=byType.get(category);
    const total=integer(source?.total),contacted=integer(source?.contacted),
      replied=Math.min(contacted,integer(source?.replied)),
      quoted=integer(source?.quoted),ordered=integer(source?.ordered),
      contactable=Math.min(total,integer(source?.contactable)),
      readyToReview=Math.min(contactable,integer(source?.readyToReview));
    const enough=contacted>=10,hasReplies=replied>=2,hasCommercial=quoted>0||ordered>0;
    const confidence:Priority['confidence']=enough?'OBSERVED':total>0?'LIMITED':'NONE';
    let level:PriorityLevel,reason:string,nextAction:string,expandable:boolean;
    if(readyToReview>0){
      level='BACKLOG';reason=`已入库且有公开联系方式、尚未联系的客户 ${readyToReview} 个。`+
        (enough?`本类别已记录 ${contacted} 个联系客户、${replied} 个回复、${quoted} 个非草稿报价、${ordered} 个订单。`:'当前回复样本仍不足10个已联系客户，不能推断胜率。');
      nextAction='先人工核对并联系已有客户，暂不增加重复搜索。';expandable=false;
    }else if(enough&&hasReplies&&hasCommercial){
      level='MULTI_STAGE';reason=`已记录 ${contacted} 个联系客户、${replied} 个回复、${quoted} 个非草稿报价和 ${ordered} 个订单。`;
      nextAction='存在多阶段实际记录，可小批扩展搜索并继续观察真实转化。';expandable=true;
    }else if(enough&&hasReplies){
      level='REPLIES';reason=`已联系 ${contacted} 个客户、收到 ${replied} 个回复；暂缺足够的报价或订单证据。`;
      nextAction='建议小批搜索与报价验证，不能按回复数量直接预测成交。';expandable=true;
    }else if(enough){
      level='RETHINK';reason=`已联系 ${contacted} 个客户，记录到 ${replied} 个回复；现有样本未显示可靠扩展理由。`;
      nextAction='先检查客户匹配程度、话术与邮箱可达性；仍可保留少量探索。';expandable=false;
    }else{
      level='EXPLORATION';reason=total>0?`CRM 有 ${total} 个客户，仅 ${contacted} 个存在已发出消息记录，样本不足。`:'尚无实际入库客户的转化证据。';
      nextAction='可在目标州进行一小批公开客户搜索与官网核验；不要因此判断市场没有需求。';expandable=true;
    }
    return {category,label,level,total,contacted,replied,quoted,ordered,
      readyToReview,contactable,confidence,reason,nextAction,expandable,
      replyRate:contacted>=10?Math.round(replied/Math.max(1,contacted)*1000)/10:null};
  });
  const order:Record<PriorityLevel,number>={BACKLOG:0,MULTI_STAGE:1,REPLIES:2,EXPLORATION:3,RETHINK:4};
  return options.sort((a,b)=>order[a.level]-order[b.level]||
    (a.level==='BACKLOG'?b.readyToReview-a.readyToReview:0)||
    (a.level==='MULTI_STAGE'?b.ordered-a.ordered||b.quoted-a.quoted:0)||
    (a.level==='REPLIES'?(b.replyRate||0)-(a.replyRate||0):0)||
    (a.level==='EXPLORATION'?a.contacted-b.contacted:0)||
    (catalogOrder.get(a.category)??999)-(catalogOrder.get(b.category)??999));
}
