import { useState, type FormEvent } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import AdminApp from './AdminApp';
import {useInquiryTurnstile} from './useInquiryTurnstile';

type ProductCard = {
  name: string;
  tag: string;
  description: string;
  audience: string;
};

type InquiryResult = { reference: string };

const SALES_EMAIL = 'mingeaglecommerce@gmail.com';

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
    <div><span>SALES</span><a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a><Link to="/wholesale">Wholesale inquiry</Link><Link to="/sample">Sample request</Link></div>
    <div><span>OPERATIONS</span><Link to="/app">Growth Engine</Link><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms of Service</Link><p>© 2026 MING EAGLE COMMERCE LLC</p></div>
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
    <section id="faq" className="section compact"><div className="section-head"><div><span className="eyebrow">FAQ</span><h2>BUILT FOR REAL BUYING QUESTIONS.</h2></div></div><div className="faq-grid"><article><strong>Do you support wholesale orders?</strong><p>Yes. Quantity, configuration, destination and timing are used to prepare an actual quote.</p></article><article><strong>Can I request samples first?</strong><p>Yes. Sample requests are tracked separately and can later be converted into a wholesale opportunity.</p></article><article><strong>How do repeat orders work?</strong><p>Your previous product mix, order history and commercial notes stay attached to the customer record.</p></article><article><strong>What is the Growth Engine?</strong><p>It is MING EAGLE's internal sales workflow for customer inquiries, quotations, order follow-up and approved business email communication.</p></article></div></section>
  </main><PublicFooter/></div>;
}

function WholesalePage({ sample = false }: { sample?: boolean }) {
  const [status,setStatus] = useState<'idle'|'submitting'|'success'|'error'>('idle');
  const [result,setResult] = useState<InquiryResult|null>(null);
  const [errorMessage,setErrorMessage] = useState('');
  const captcha=useInquiryTurnstile();

  async function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if(captcha.mode==='loading'||captcha.mode==='unavailable'||(captcha.mode==='required'&&!captcha.token)){
      setStatus('error');
      setErrorMessage(captcha.mode==='required'?'Please complete the security check before submitting.':
        'Security verification is temporarily unavailable. Please contact us by email.');
      return;
    }
    const formData = new FormData(form);
    setStatus('submitting'); setErrorMessage('');
    try {
      const response = await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        firstName:formData.get('firstName'),lastName:formData.get('lastName'),email:formData.get('email'),phone:formData.get('phone'),whatsapp:formData.get('whatsapp'),company:formData.get('company'),customerType:formData.get('customerType'),estimatedQuantity:formData.get('estimatedQuantity'),country:formData.get('country'),postalCode:formData.get('postalCode'),message:formData.get('message'),requestType:sample?'SAMPLE':'WHOLESALE',productInterest:'SILENT_BALL',turnstileToken:captcha.token,privacyAck:true
      })});
      const data = await response.json() as {ok?:boolean;reference?:string;error?:string};
      if(!response.ok||!data.ok||!data.reference) throw new Error(data.error||'Unable to submit your request.');
      setResult({reference:data.reference}); setStatus('success'); form.reset();
    } catch(error) {
      captcha.reset();
      setErrorMessage(error instanceof Error?error.message:'Unable to submit your request.');
      setStatus('error');
    }
  }

  return <div className="public-shell"><PublicHeader/><main className="form-page"><div className="form-intro"><span className="eyebrow">{sample?'SAMPLE REQUEST':'WHOLESALE / BULK ORDER'}</span><h1>{sample?'TRY THE PRODUCT BEFORE A BIGGER ORDER.':'TELL US WHAT YOU NEED. WE’LL BUILD THE RIGHT QUOTE.'}</h1><p>{sample?'Your request becomes a tracked sales record so sample follow-up does not get lost.':'Your request enters the MING EAGLE sales workflow so quote, follow-up and reorder history stay connected.'}</p></div>
    <form className="lead-form" onSubmit={submitInquiry}><div className="form-grid"><label>First name *<input name="firstName" required placeholder="First name"/></label><label>Last name *<input name="lastName" required placeholder="Last name"/></label><label>Email *<input name="email" required type="email" placeholder="you@company.com"/></label><label>Phone<input name="phone" type="tel" placeholder="+1 555 123 4567"/></label><label>WhatsApp<input name="whatsapp" type="tel" placeholder="+1 555 123 4567"/></label><label>Company / organization<input name="company" placeholder="Academy, retailer, club…"/></label><label>Customer type<select name="customerType" defaultValue="Academy"><option>Academy</option><option>Coach / trainer</option><option>Retailer</option><option>Camp / program</option><option>Distributor</option><option>Family / consumer</option></select></label><label>Estimated quantity<input name="estimatedQuantity" type="number" min="1" placeholder={sample?'1':'100'}/></label><label>Country *<input name="country" required defaultValue="United States"/></label><label>ZIP / postal code<input name="postalCode" placeholder="75201"/></label></div><label>What are you looking for?<textarea name="message" rows={5} placeholder="Product, sizes, colors, timing, delivery needs…"/></label><div ref={captcha.container} aria-label="Security verification"/>
      {captcha.mode==='required'&&!captcha.token&&<p className="form-note">Complete the security verification before sending.</p>}
      {captcha.mode==='unavailable'&&<p className="form-note">Security verification is temporarily unavailable. Please email {SALES_EMAIL}.</p>}
      <button className="button" type="submit" disabled={status==='submitting'||captcha.mode==='loading'||captcha.mode==='unavailable'}>{status==='submitting'?'Submitting…':sample?'Request sample':'Request wholesale quote'}{status!=='submitting'&&<ArrowRight size={18}/>}</button>
      {status==='success'&&result&&<div className="form-status success"><strong>Request received.</strong><span>Reference: {result.reference}</span><p>We’ll review the request and continue from this reference.</p></div>}
      {status==='error'&&<div className="form-status error"><strong>Submission failed.</strong><p>{errorMessage}</p></div>}
      <p className="form-note">Phone and WhatsApp are optional. Your contact and request details are stored only for sales follow-up, quotation and order support.</p>
    </form></main><PublicFooter/></div>;
}

function PrivacyPage() {
  return <div className="public-shell"><PublicHeader/><main className="form-page"><section className="form-intro" style={{maxWidth:'920px'}}>
    <span className="eyebrow">LEGAL</span><h1>PRIVACY POLICY</h1><p>Effective date: October 5, 2026</p>
    <h2>1. Who we are</h2><p>MING EAGLE COMMERCE LLC operates the MING EAGLE website and Growth Engine. Contact: <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.</p>
    <h2>2. Information we collect</h2><p>We may collect business contact details, inquiry information, sample requests, quotation and order information, shipping details, communication history, and technical information needed to operate our services.</p>
    <h2>3. Google user data and Gmail API</h2><p>Our Growth Engine may connect to a Google account using OAuth 2.0. The application requests the Gmail <strong>gmail.send</strong> scope only so an authorized MING EAGLE user can send business email through that connected Gmail account. The application does not request permission to read, search, download, or modify the Gmail inbox.</p>
    <p>OAuth access and refresh tokens are used only to authenticate approved Gmail API requests. Tokens are stored as protected server-side secrets and are not displayed publicly. We do not sell Google user data, use it for advertising, or share it with third parties except service providers necessary to operate the application and only as required to provide the service.</p>
    <h2>4. How we use information</h2><p>We use information to respond to inquiries, prepare quotations, manage samples and orders, provide shipping and customer support, maintain sales records, send approved business communications, protect our systems, and comply with legal obligations.</p>
    <h2>5. Data sharing</h2><p>We do not sell personal information. We may use infrastructure and service providers such as Cloudflare and Google to host the application, store application data, or provide authorized email functionality. We may also disclose information when required by law.</p>
    <h2>6. Data retention and security</h2><p>We retain business records only as reasonably necessary for customer service, commercial operations, legal compliance, and security. We use access controls, encrypted secrets, and service-provider security features to protect information.</p>
    <h2>7. Your choices</h2><p>You may ask us to correct or delete eligible information, stop sales communications, or revoke Google OAuth access at any time through your Google Account security settings. Revoking access prevents future Gmail API use until the account is authorized again.</p>
    <h2>8. Contact</h2><p>For privacy questions, email <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.</p>
  </section></main><PublicFooter/></div>;
}

function TermsPage() {
  return <div className="public-shell"><PublicHeader/><main className="form-page"><section className="form-intro" style={{maxWidth:'920px'}}>
    <span className="eyebrow">LEGAL</span><h1>TERMS OF SERVICE</h1><p>Effective date: October 5, 2026</p>
    <h2>1. Scope</h2><p>These terms govern use of the MING EAGLE website, inquiry forms, quotation links, customer communications, and related business services operated by MING EAGLE COMMERCE LLC.</p>
    <h2>2. Business information</h2><p>Product descriptions, prices, lead times, shipping estimates, customization options, and availability may change. A quotation or order is binding only when the applicable commercial terms are confirmed.</p>
    <h2>3. Acceptable use</h2><p>You may not misuse the website, attempt unauthorized access, interfere with the service, submit unlawful content, or use the service to violate applicable law or third-party rights.</p>
    <h2>4. Email and communications</h2><p>Where authorized, MING EAGLE may use connected communication services to send inquiry responses, quotations, order updates, follow-ups, and other legitimate business communications. Recipients may request that sales communications stop.</p>
    <h2>5. Intellectual property</h2><p>MING EAGLE branding, website content, product materials, and software remain the property of MING EAGLE COMMERCE LLC or their respective licensors unless otherwise stated.</p>
    <h2>6. Disclaimer</h2><p>The website and Growth Engine are provided on an as-available basis. We work to keep information and services accurate and available but do not guarantee uninterrupted operation.</p>
    <h2>7. Changes</h2><p>We may update these terms as our services change. The effective date above identifies the current version.</p>
    <h2>8. Contact</h2><p>Questions about these terms may be sent to <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>.</p>
  </section></main><PublicFooter/></div>;
}

export default function App() {
  return <Routes>
    <Route path="/" element={<HomePage/>}/>
    <Route path="/wholesale" element={<WholesalePage/>}/>
    <Route path="/sample" element={<WholesalePage sample/>}/>
    <Route path="/privacy" element={<PrivacyPage/>}/>
    <Route path="/terms" element={<TermsPage/>}/>
    <Route path="/app/*" element={<AdminApp/>}/>
    <Route path="*" element={<HomePage/>}/>
  </Routes>;
}