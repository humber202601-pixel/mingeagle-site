import { useState, type FormEvent } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import AdminApp from './AdminApp';

type ProductCard = {
  name: string;
  tag: string;
  description: string;
  audience: string;
};

type InquiryResult = { reference: string };

const products: ProductCard[] = [
  {
    name: 'Silent Basketball Set',
    tag: 'STAR PRODUCT',
    description: 'Quiet indoor basketball play and practice with multiple size options for home, training and gifting.',
    audience: 'Families · Academies · Retailers',
  },
  {
    name: 'Flocked Weighted Silent Basketball',
    tag: 'PREMIUM FEEL',
    description: 'A denser flocked silent-ball option designed for a more substantial hand feel and controlled indoor play.',
    audience: 'Youth · Indoor Practice · Wholesale',
  },
  {
    name: 'Silent Soccer Ball',
    tag: 'INDOOR SOCCER',
    description: 'Soft quiet-touch soccer entertainment for children and youth in indoor environments.',
    audience: 'Families · Camps · Youth Programs',
  },
  {
    name: 'Silent Ball Bundles',
    tag: 'WHOLESALE READY',
    description: 'Mixed silent-ball configurations for retailers, academies, camps and promotional programs.',
    audience: 'B2B · Bulk Orders · Reorders',
  },
];

function PublicHeader() {
  return <>
    <div className="announcement">MING EAGLE · SILENT BALL PRODUCTS · RETAIL & WHOLESALE</div>
    <header className="site-header">
      <Link to="/" className="brand"><span className="brand-mark">ME</span><span><strong>MING EAGLE</strong><small>SILENT BALL</small></span></Link>
      <nav><a href="/#products">Products</a><Link to="/wholesale">Wholesale</Link><Link to="/sample">Samples</Link><a href="/#faq">FAQ</a></nav>
      <Link className="button small" to="/wholesale">Request quote</Link>
    </header>
  </>;
}

function PublicFooter() {
  return <footer className="site-footer">
    <div><strong>MING EAGLE</strong><p>Silent Ball products for families, coaches, academies, camps and retailers.</p></div>
    <div><span>SALES</span><a href="mailto:ning@mingeagle.com">ning@mingeagle.com</a><Link to="/wholesale">Wholesale inquiry</Link><Link to="/sample">Sample request</Link></div>
    <div><span>OPERATIONS</span><Link to="/app">Growth Engine</Link><p>© 2026 MING EAGLE COMMERCE LLC</p></div>
  </footer>;
}

function HomePage() {
  return <div className="public-shell"><PublicHeader/><main>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><Sparkles size={16}/> QUIETER PLAY. BIGGER COMMERCIAL SYSTEM.</div>
        <h1>THE SILENT BALL IS THE PRODUCT. <span>THE SYSTEM BUILDS THE CUSTOMER.</span></h1>
        <p>MING EAGLE focuses on a proven silent-ball product family while giving wholesale buyers, academies and retailers a simple path from inquiry to quote, order, shipment and reorder.</p>
        <div className="hero-actions"><a href="#products" className="button">Explore products <ArrowRight size={18}/></a><Link to="/wholesale" className="button secondary">Wholesale inquiry</Link></div>
        <div className="trust-row"><span><CheckCircle2 size={16}/> U.S. market focused</span><span><CheckCircle2 size={16}/> Wholesale & sample support</span><span><CheckCircle2 size={16}/> Reorder-ready workflow</span></div>
      </div>
      <div className="hero-card"><span className="hero-card-kicker">MING EAGLE SILENT BALL</span><div className="orb"><span>QUIET</span><strong>PLAY</strong></div><div className="hero-card-grid"><div><small>USE</small><strong>INDOOR</strong></div><div><small>BUYERS</small><strong>B2C + B2B</strong></div><div><small>FLOW</small><strong>QUOTE → ORDER</strong></div><div><small>NEXT</small><strong>REORDER</strong></div></div></div>
    </section>
    <section className="proof-strip"><span>30,000+ SETS SOLD IN THE U.S. ECOSYSTEM</span><b>•</b><span>HOME PRACTICE</span><b>•</b><span>YOUTH PROGRAMS</span><b>•</b><span>WHOLESALE</span></section>
    <section id="products" className="section">
      <div className="section-head"><div><span className="eyebrow">PRODUCT FAMILY</span><h2>FOCUS THE BRAND. MAKE BUYING SIMPLE.</h2></div><Link to="/wholesale">Need bulk pricing? <ArrowRight size={16}/></Link></div>
      <div className="product-grid">{products.map((product,index)=><article className="product-card" key={product.name}><div className="product-visual"><span>{String(index+1).padStart(2,'0')}</span><div className="mini-orb"/></div><div className="product-copy"><small>{product.tag}</small><h3>{product.name}</h3><p>{product.description}</p><div className="product-bottom"><span>{product.audience}</span><Link to="/wholesale">Ask for pricing <ArrowRight size={15}/></Link></div></div></article>)}</div>
    </section>
    <section className="workflow-band"><div><span className="eyebrow">COMMERCIAL WORKFLOW</span><h2>FROM FIRST QUESTION TO REPEAT ORDER.</h2></div><div className="workflow-grid">{[
      ['01','INQUIRY','Customer tells us product, quantity and destination.'],['02','QUOTE','We build the actual configuration and commercial terms.'],['03','ORDER','Accepted quote becomes a tracked order.'],['04','SHIP','Carrier, tracking and delivery stay attached to the order.'],['05','REORDER','History is preserved so the next order is easier.']
    ].map(([n,t,d])=><div key={n}><span>{n}</span><strong>{t}</strong><p>{d}</p></div>)}</div></section>
    <section id="faq" className="section compact"><div className="section-head"><div><span className="eyebrow">FAQ</span><h2>BUILT FOR REAL BUYING QUESTIONS.</h2></div></div><div className="faq-grid"><article><strong>Do you support wholesale orders?</strong><p>Yes. Quantity, configuration, destination and timing are used to prepare an actual quote.</p></article><article><strong>Can I request samples first?</strong><p>Yes. Sample requests are tracked separately and can later be converted into a wholesale opportunity.</p></article><article><strong>How do repeat orders work?</strong><p>Your previous product mix, order history and commercial notes stay attached to the customer record.</p></article><article><strong>Can I buy for an academy or retailer?</strong><p>Yes. The site is designed for both individual customers and commercial buyers.</p></article></div></section>
  </main><PublicFooter/></div>;
}

function WholesalePage({ sample = false }: { sample?: boolean }) {
  const [status,setStatus] = useState<'idle'|'submitting'|'success'|'error'>('idle');
  const [result,setResult] = useState<InquiryResult|null>(null);
  const [errorMessage,setErrorMessage] = useState('');

  async function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setStatus('submitting'); setErrorMessage('');
    try {
      const response = await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        firstName:formData.get('firstName'),lastName:formData.get('lastName'),email:formData.get('email'),phone:formData.get('phone'),whatsapp:formData.get('whatsapp'),company:formData.get('company'),customerType:formData.get('customerType'),estimatedQuantity:formData.get('estimatedQuantity'),country:formData.get('country'),postalCode:formData.get('postalCode'),message:formData.get('message'),requestType:sample?'SAMPLE':'WHOLESALE',productInterest:'SILENT_BALL'
      })});
      const data = await response.json() as {ok?:boolean;reference?:string;error?:string};
      if(!response.ok||!data.ok||!data.reference) throw new Error(data.error||'Unable to submit your request.');
      setResult({reference:data.reference}); setStatus('success'); form.reset();
    } catch(error) { setErrorMessage(error instanceof Error?error.message:'Unable to submit your request.'); setStatus('error'); }
  }

  return <div className="public-shell"><PublicHeader/><main className="form-page"><div className="form-intro"><span className="eyebrow">{sample?'SAMPLE REQUEST':'WHOLESALE / BULK ORDER'}</span><h1>{sample?'TRY THE PRODUCT BEFORE A BIGGER ORDER.':'TELL US WHAT YOU NEED. WE’LL BUILD THE RIGHT QUOTE.'}</h1><p>{sample?'Your request becomes a tracked sales record so sample follow-up does not get lost.':'Your request enters the MING EAGLE sales workflow so quote, follow-up and reorder history stay connected.'}</p></div>
    <form className="lead-form" onSubmit={submitInquiry}><div className="form-grid"><label>First name *<input name="firstName" required placeholder="First name"/></label><label>Last name *<input name="lastName" required placeholder="Last name"/></label><label>Email *<input name="email" required type="email" placeholder="you@company.com"/></label><label>Phone<input name="phone" type="tel" placeholder="+1 555 123 4567"/></label><label>WhatsApp<input name="whatsapp" type="tel" placeholder="+1 555 123 4567"/></label><label>Company / organization<input name="company" placeholder="Academy, retailer, club…"/></label><label>Customer type<select name="customerType" defaultValue="Academy"><option>Academy</option><option>Coach / trainer</option><option>Retailer</option><option>Camp / program</option><option>Distributor</option><option>Family / consumer</option></select></label><label>Estimated quantity<input name="estimatedQuantity" type="number" min="1" placeholder={sample?'1':'100'}/></label><label>Country *<input name="country" required defaultValue="United States"/></label><label>ZIP / postal code<input name="postalCode" placeholder="75201"/></label></div><label>What are you looking for?<textarea name="message" rows={5} placeholder="Product, sizes, colors, timing, delivery needs…"/></label><button className="button" type="submit" disabled={status==='submitting'}>{status==='submitting'?'Submitting…':sample?'Request sample':'Request wholesale quote'}{status!=='submitting'&&<ArrowRight size={18}/>}</button>
      {status==='success'&&result&&<div className="form-status success"><strong>Request received.</strong><span>Reference: {result.reference}</span><p>We’ll review the request and continue from this reference.</p></div>}
      {status==='error'&&<div className="form-status error"><strong>Submission failed.</strong><p>{errorMessage}</p></div>}
      <p className="form-note">Phone and WhatsApp are optional. Your contact and request details are stored only for sales follow-up, quotation and order support.</p>
    </form></main><PublicFooter/></div>;
}

export default function App() {
  return <Routes>
    <Route path="/" element={<HomePage/>}/>
    <Route path="/wholesale" element={<WholesalePage/>}/>
    <Route path="/sample" element={<WholesalePage sample/>}/>
    <Route path="/app/*" element={<AdminApp/>}/>
    <Route path="*" element={<HomePage/>}/>
  </Routes>;
}
