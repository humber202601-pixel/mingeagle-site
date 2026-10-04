import { Link, NavLink, Route, Routes } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  ContactRound,
  Gauge,
  Inbox,
  PackageCheck,
  RefreshCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Target,
  Truck,
  Users,
} from 'lucide-react';

type ProductCard = {
  name: string;
  tag: string;
  description: string;
  audience: string;
};

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

const pipelineCards = [
  ['New leads', '18', '+5 this week'],
  ['Open inquiries', '7', '3 need replies'],
  ['Quotes waiting', '4', '$3,860 pipeline'],
  ['Orders active', '6', '2 ready to ship'],
];

function PublicHeader() {
  return (
    <>
      <div className="announcement">MING EAGLE · SILENT BALL PRODUCTS · RETAIL & WHOLESALE</div>
      <header className="site-header">
        <Link to="/" className="brand">
          <span className="brand-mark">ME</span>
          <span><strong>MING EAGLE</strong><small>SILENT BALL</small></span>
        </Link>
        <nav>
          <a href="#products">Products</a>
          <Link to="/wholesale">Wholesale</Link>
          <Link to="/sample">Samples</Link>
          <a href="#faq">FAQ</a>
        </nav>
        <Link className="button small" to="/wholesale">Request quote</Link>
      </header>
    </>
  );
}

function PublicFooter() {
  return (
    <footer className="site-footer">
      <div>
        <strong>MING EAGLE</strong>
        <p>Silent Ball products for families, coaches, academies, camps and retailers.</p>
      </div>
      <div>
        <span>SALES</span>
        <a href="mailto:ning@mingeagle.com">ning@mingeagle.com</a>
        <Link to="/wholesale">Wholesale inquiry</Link>
        <Link to="/sample">Sample request</Link>
      </div>
      <div>
        <span>OPERATIONS</span>
        <Link to="/app">Growth Engine</Link>
        <p>© 2026 MING EAGLE COMMERCE LLC</p>
      </div>
    </footer>
  );
}

function HomePage() {
  return (
    <div className="public-shell">
      <PublicHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={16}/> QUIETER PLAY. BIGGER COMMERCIAL SYSTEM.</div>
            <h1>THE SILENT BALL IS THE PRODUCT. <span>THE SYSTEM BUILDS THE CUSTOMER.</span></h1>
            <p>MING EAGLE focuses on a proven silent-ball product family while giving wholesale buyers, academies and retailers a simple path from inquiry to quote, order, shipment and reorder.</p>
            <div className="hero-actions">
              <a href="#products" className="button">Explore products <ArrowRight size={18}/></a>
              <Link to="/wholesale" className="button secondary">Wholesale inquiry</Link>
            </div>
            <div className="trust-row">
              <span><CheckCircle2 size={16}/> U.S. market focused</span>
              <span><CheckCircle2 size={16}/> Wholesale & sample support</span>
              <span><CheckCircle2 size={16}/> Reorder-ready workflow</span>
            </div>
          </div>
          <div className="hero-card">
            <span className="hero-card-kicker">MING EAGLE SILENT BALL</span>
            <div className="orb"><span>QUIET</span><strong>PLAY</strong></div>
            <div className="hero-card-grid">
              <div><small>USE</small><strong>INDOOR</strong></div>
              <div><small>BUYERS</small><strong>B2C + B2B</strong></div>
              <div><small>FLOW</small><strong>QUOTE → ORDER</strong></div>
              <div><small>NEXT</small><strong>REORDER</strong></div>
            </div>
          </div>
        </section>

        <section className="proof-strip">
          <span>30,000+ SETS SOLD IN THE U.S. ECOSYSTEM</span>
          <b>•</b><span>HOME PRACTICE</span><b>•</b><span>YOUTH PROGRAMS</span><b>•</b><span>WHOLESALE</span>
        </section>

        <section id="products" className="section">
          <div className="section-head">
            <div><span className="eyebrow">PRODUCT FAMILY</span><h2>FOCUS THE BRAND. MAKE BUYING SIMPLE.</h2></div>
            <Link to="/wholesale">Need bulk pricing? <ArrowRight size={16}/></Link>
          </div>
          <div className="product-grid">
            {products.map((product, index) => (
              <article className="product-card" key={product.name}>
                <div className="product-visual"><span>{String(index + 1).padStart(2, '0')}</span><div className="mini-orb"/></div>
                <div className="product-copy">
                  <small>{product.tag}</small>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                  <div className="product-bottom"><span>{product.audience}</span><Link to="/wholesale">Ask for pricing <ArrowRight size={15}/></Link></div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="workflow-band">
          <div><span className="eyebrow">COMMERCIAL WORKFLOW</span><h2>FROM FIRST QUESTION TO REPEAT ORDER.</h2></div>
          <div className="workflow-grid">
            {[
              ['01','INQUIRY','Customer tells us product, quantity and destination.'],
              ['02','QUOTE','We build the actual configuration and commercial terms.'],
              ['03','ORDER','Accepted quote becomes a tracked order.'],
              ['04','SHIP','Carrier, tracking and delivery stay attached to the order.'],
              ['05','REORDER','History is preserved so the next order is easier.'],
            ].map(([n,t,d]) => <div key={n}><span>{n}</span><strong>{t}</strong><p>{d}</p></div>)}
          </div>
        </section>

        <section id="faq" className="section compact">
          <div className="section-head"><div><span className="eyebrow">FAQ</span><h2>BUILT FOR REAL BUYING QUESTIONS.</h2></div></div>
          <div className="faq-grid">
            <article><strong>Do you support wholesale orders?</strong><p>Yes. Quantity, configuration, destination and timing are used to prepare an actual quote.</p></article>
            <article><strong>Can I request samples first?</strong><p>Yes. Sample requests are tracked separately and can later be converted into a wholesale opportunity.</p></article>
            <article><strong>How do repeat orders work?</strong><p>Your previous product mix, order history and commercial notes stay attached to the customer record.</p></article>
            <article><strong>Can I buy for an academy or retailer?</strong><p>Yes. The site is designed for both individual customers and commercial buyers.</p></article>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function WholesalePage({ sample = false }: { sample?: boolean }) {
  return (
    <div className="public-shell">
      <PublicHeader />
      <main className="form-page">
        <div className="form-intro">
          <span className="eyebrow">{sample ? 'SAMPLE REQUEST' : 'WHOLESALE / BULK ORDER'}</span>
          <h1>{sample ? 'TRY THE PRODUCT BEFORE A BIGGER ORDER.' : 'TELL US WHAT YOU NEED. WE’LL BUILD THE RIGHT QUOTE.'}</h1>
          <p>{sample ? 'Samples create a tracked sales opportunity, not a dead-end form.' : 'This form will feed the same internal lead, quote and order system used by the MING EAGLE Growth Engine.'}</p>
        </div>
        <form className="lead-form" onSubmit={(e) => e.preventDefault()}>
          <div className="form-grid">
            <label>First name *<input required placeholder="First name"/></label>
            <label>Last name *<input required placeholder="Last name"/></label>
            <label>Email *<input required type="email" placeholder="you@company.com"/></label>
            <label>Company / organization<input placeholder="Academy, retailer, club…"/></label>
            <label>Customer type<select defaultValue="Academy"><option>Academy</option><option>Coach / trainer</option><option>Retailer</option><option>Camp / program</option><option>Distributor</option><option>Family / consumer</option></select></label>
            <label>Estimated quantity<input type="number" min="1" placeholder={sample ? '1' : '100'}/></label>
            <label>Country *<input required defaultValue="United States"/></label>
            <label>ZIP / postal code<input placeholder="75201"/></label>
          </div>
          <label>What are you looking for?<textarea rows={5} placeholder="Product, sizes, colors, timing, delivery needs…"/></label>
          <button className="button" type="submit">{sample ? 'Request sample' : 'Request wholesale quote'} <ArrowRight size={18}/></button>
          <p className="form-note">Phase 1 shell: the API connection is being built on this development branch. The current production site remains unchanged.</p>
        </form>
      </main>
      <PublicFooter />
    </div>
  );
}

const adminNav = [
  ['/app', Gauge, 'Dashboard'],
  ['/app/leads', Target, 'Leads'],
  ['/app/inquiries', Inbox, 'Inquiries'],
  ['/app/companies', Building2, 'Companies'],
  ['/app/contacts', ContactRound, 'Contacts'],
  ['/app/quotes', CircleDollarSign, 'Quotes'],
  ['/app/orders', ShoppingBag, 'Orders'],
  ['/app/tasks', ClipboardList, 'Follow-ups'],
];

function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link to="/" className="admin-brand"><span className="brand-mark">ME</span><div><strong>MING EAGLE</strong><small>GROWTH ENGINE</small></div></Link>
        <div className="side-section">OPERATIONS</div>
        <nav>
          {adminNav.map(([path, Icon, label]) => {
            const I = Icon as typeof Gauge;
            return <NavLink end={path === '/app'} to={path as string} key={path as string}><I size={17}/>{label as string}</NavLink>;
          })}
        </nav>
        <div className="side-section">AUTOMATION</div>
        <nav>
          <a href="#automation"><RefreshCcw size={17}/>Rules & triggers</a>
          <a href="#find"><Search size={17}/>Find Customers</a>
        </nav>
        <div className="sidebar-footer"><span>V2 DEVELOPMENT</span><small>Cloudflare free stack</small></div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}

function AdminTop({ title, description }: { title: string; description: string }) {
  return <header className="admin-top"><div><span className="eyebrow">MING EAGLE OPERATIONS</span><h1>{title}</h1><p>{description}</p></div><button className="button small">+ New</button></header>;
}

function Dashboard() {
  return <AdminLayout>
    <AdminTop title="Dashboard" description="One place to see sales pipeline, follow-ups, quotes, orders and reorder opportunities."/>
    <section className="metric-grid">{pipelineCards.map(([label,value,note]) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</section>
    <section className="admin-grid two-col">
      <div className="panel"><div className="panel-head"><h2>Today’s priorities</h2><span>Next Best Action</span></div>{[
        ['Follow up Dallas Elite Basketball','Quote viewed 2 days ago','HIGH'],
        ['Reply to sample request','Youth academy · 20 pcs','HIGH'],
        ['Confirm shipping address','Order ME-1024','MED'],
        ['Reorder outreach','Customer bought 90 days ago','MED'],
      ].map(([t,s,p]) => <div className="list-row" key={t}><div><strong>{t}</strong><small>{s}</small></div><span className={`priority ${p.toLowerCase()}`}>{p}</span></div>)}</div>
      <div className="panel"><div className="panel-head"><h2>Pipeline</h2><BarChart3 size={18}/></div><div className="pipeline"><div><span>Qualified</span><strong>12</strong></div><div><span>Contacted</span><strong>8</strong></div><div><span>Sample</span><strong>5</strong></div><div><span>Quote</span><strong>4</strong></div><div><span>Won</span><strong>2</strong></div></div></div>
    </section>
    <section className="panel"><div className="panel-head"><h2>Recent activity</h2><span>Shared customer timeline</span></div>{[
      ['New inquiry','Austin Youth Hoops requested wholesale pricing','2 min ago'],
      ['Quote viewed','ME-Q-1008 opened by customer','31 min ago'],
      ['Order shipped','ME-1021 · UPS tracking added','1 hr ago'],
      ['Lead qualified','Phoenix Skills Lab scored 82/100','3 hr ago'],
    ].map(([a,b,c]) => <div className="activity" key={b}><span/><div><strong>{a}</strong><p>{b}</p></div><small>{c}</small></div>)}</section>
  </AdminLayout>;
}

function TablePage({ title, description, columns, rows }: { title:string; description:string; columns:string[]; rows:string[][] }) {
  return <AdminLayout><AdminTop title={title} description={description}/><section className="panel table-panel"><div className="table-tools"><input placeholder={`Search ${title.toLowerCase()}…`}/><button className="button secondary small">Filters</button></div><div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div></section></AdminLayout>;
}

function App() {
  return <Routes>
    <Route path="/" element={<HomePage/>}/>
    <Route path="/wholesale" element={<WholesalePage/>}/>
    <Route path="/sample" element={<WholesalePage sample/>}/>
    <Route path="/app" element={<Dashboard/>}/>
    <Route path="/app/leads" element={<TablePage title="Leads" description="Inbound and outbound opportunities share one lifecycle." columns={['Company','Contact','Score','Status','Next action']} rows={[["Dallas Elite Basketball","John Smith","86","QUOTE","Follow up Oct 8"],["Phoenix Skills Lab","Maya Chen","82","QUALIFIED","Find direct email"],["Austin Youth Hoops","Chris Lee","77","REPLIED","Send sample options"]]}/>}/>
    <Route path="/app/inquiries" element={<TablePage title="Inquiries" description="Every website request becomes a structured sales record." columns={['Reference','Customer','Type','Qty','Status']} rows={[["MEQ-1028","Austin Youth Hoops","Wholesale","100","NEW"],["MEQ-1027","Family Sports LLC","Retailer","250","REVIEWING"],["MEQ-1026","Coach Taylor","Sample","2","RESPONDED"]]}/>}/>
    <Route path="/app/companies" element={<TablePage title="Companies" description="Company intelligence, customer type, contacts and buying history." columns={['Company','Type','Location','Stage','Owner']} rows={[["Dallas Elite Basketball","Academy","Dallas, TX","Customer","Ning"],["Family Sports LLC","Retailer","Columbus, OH","Prospect","Ning"],["Phoenix Skills Lab","Academy","Phoenix, AZ","Prospect","Ning"]]}/>}/>
    <Route path="/app/contacts" element={<TablePage title="Contacts" description="Decision makers and contact evidence stay tied to the company record." columns={['Name','Company','Role','Email','Quality']} rows={[["John Smith","Dallas Elite Basketball","Founder","john@…","92"],["Maya Chen","Phoenix Skills Lab","Program Director","maya@…","84"],["Chris Lee","Austin Youth Hoops","Owner","chris@…","88"]]}/>}/>
    <Route path="/app/quotes" element={<TablePage title="Quotes" description="Build, send, track, accept and convert quotes into orders." columns={['Quote','Customer','Total','Status','Valid until']} rows={[["ME-Q-1008","Dallas Elite Basketball","$1,980","VIEWED","Oct 12"],["ME-Q-1007","Family Sports LLC","$3,420","SENT","Oct 15"],["ME-Q-1006","Coach Taylor","$248","ACCEPTED","Oct 09"]]}/>}/>
    <Route path="/app/orders" element={<TablePage title="Orders" description="Track payment, processing, shipment, delivery and reorder history." columns={['Order','Customer','Total','Status','Tracking']} rows={[["ME-1024","Coach Taylor","$248","PROCESSING","—"],["ME-1021","Dallas Elite Basketball","$1,420","SHIPPED","UPS 1Z…"],["ME-1018","Westside Camp","$2,860","COMPLETED","Delivered"]]}/>}/>
    <Route path="/app/tasks" element={<TablePage title="Follow-ups" description="Tasks are generated by humans and automation rules." columns={['Task','Related to','Priority','Due','Status']} rows={[["Follow up quote","Dallas Elite Basketball","HIGH","Today","OPEN"],["Sample delivery check","Coach Taylor","HIGH","Tomorrow","OPEN"],["Reorder outreach","Westside Camp","MEDIUM","Oct 15","OPEN"]]}/>}/>
    <Route path="*" element={<HomePage/>}/>
  </Routes>;
}

export default App;
