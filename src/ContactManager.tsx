import { useMemo, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { emailTypeLabel } from './adminI18n';

type Row = Record<string, unknown>;
const text = (value: unknown, fallback = '') => value === null || value === undefined || value === '' ? fallback : String(value);

export default function ContactManager({ contacts, accessKey, onChanged }: { contacts: Row[]; accessKey: string; onChanged: () => void }) {
  const [query,setQuery] = useState('');
  const [busy,setBusy] = useState('');
  const [message,setMessage] = useState<Record<string,string>>({});

  const visible = useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q) return contacts;
    return contacts.filter(c=>[c.full_name,c.company,c.email,c.phone,c.whatsapp,c.title].some(v=>text(v).toLowerCase().includes(q)));
  },[contacts,query]);

  async function save(event: FormEvent<HTMLFormElement>, contactId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(contactId); setMessage(prev=>({...prev,[contactId]:''}));
    try {
      const response = await fetch('/api/admin/contact-update',{
        method:'POST',headers:{'Content-Type':'application/json','x-admin-key':accessKey},
        body:JSON.stringify({contactId,title:data.get('title'),phone:data.get('phone'),whatsapp:data.get('whatsapp'),doNotContact:data.get('doNotContact')==='on'})
      });
      const body=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!body.ok) throw new Error(body.error||'无法保存联系人。');
      setMessage(prev=>({...prev,[contactId]:'已保存'})); onChanged();
    } catch(err) { setMessage(prev=>({...prev,[contactId]:err instanceof Error?err.message:'无法保存联系人。'})); }
    finally { setBusy(''); }
  }

  return <section className="panel contact-manager">
    <div className="table-tools searchable-tools"><div><strong>共 {visible.length} 位联系人</strong><span> · 可直接补录电话与 WhatsApp</span></div><div className="table-filters"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索姓名、公司、邮箱、电话…"/></div></div>
    {!visible.length && <div className="empty-row">暂无联系人。</div>}
    <div className="contact-edit-list">{visible.map((contact,index)=>{
      const id=text(contact.id,`contact-${index}`);
      return <form className="contact-edit-card" key={id} onSubmit={e=>void save(e,id)}>
        <div className="contact-edit-head"><div><strong>{text(contact.full_name,'未命名联系人')}</strong><p>{text(contact.company,'—')} · {text(contact.email,'—')} · {emailTypeLabel(contact.email_type)}</p></div>{Number(contact.do_not_contact||0)===1&&<span className="dnc-badge">禁止联系</span>}</div>
        <div className="contact-edit-grid">
          <label>职位<input name="title" defaultValue={text(contact.title)} placeholder="Owner / Buyer / Coach"/></label>
          <label>电话<input name="phone" defaultValue={text(contact.phone)} placeholder="+1 555 123 4567"/></label>
          <label>WhatsApp<input name="whatsapp" defaultValue={text(contact.whatsapp)} placeholder="+1 555 123 4567"/></label>
          <label className="contact-checkbox"><input name="doNotContact" type="checkbox" defaultChecked={Number(contact.do_not_contact||0)===1}/><span>禁止主动联系（Do Not Contact）</span></label>
        </div>
        <div className="contact-edit-actions"><button className="button small" disabled={busy!==''}><Save size={14}/>{busy===id?'保存中…':'保存联系人'}</button>{message[id]&&<span>{message[id]}</span>}</div>
      </form>;
    })}</div>
  </section>;
}
