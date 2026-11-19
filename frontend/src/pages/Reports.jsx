import React,{useEffect,useState} from "react";
import api from "../services/api";
import {PageHeader,Loader} from "../components/UI";
import {FileDown,ShieldCheck,ReceiptIndianRupee,TriangleAlert,ScrollText} from "lucide-react";
import {useAuth} from "../App";

export default function Reports(){
 const [integrations,setIntegrations]=useState(null),[deliveryRows,setDeliveryRows]=useState([]),[integrationError,setIntegrationError]=useState(""),[reportError,setReportError]=useState(""),[vendors,setVendors]=useState([]),[filters,setFilters]=useState({search:"",date_from:"",date_to:"",vendor:"",status:""});
 const {user}=useAuth();
 useEffect(()=>{const requests=[api.get("/integrations/status/"),user?.role==="ADMIN"?api.get("/integration-deliveries/"):Promise.resolve({data:[]}),api.get("/vendors/")];Promise.all(requests).then(([status,deliveries,vendorResponse])=>{setIntegrations(status.data);setDeliveryRows(deliveries.data.results||deliveries.data);setVendors(vendorResponse.data.results||vendorResponse.data)}).catch(err=>setIntegrationError(err.response?.data?.detail||"Unable to load integration status."))},[]);
 const reports=[
  ["aging","AP Aging","Outstanding invoices with due dates and days overdue",ReceiptIndianRupee],
  ["invoice-status","Invoice Status","Invoice status and processing summary",FileDown],
  ["exceptions","Exception Report","Validation and matching exceptions",TriangleAlert],
  ["gst","GST / Tax","Vendor GST and tax amounts",ShieldCheck],
  ["audit","Audit Log","Timestamped user and record activity",ScrollText],
 ];
 const download=async(kind)=>{
  setReportError("");
  try{
   const params={kind};
   Object.entries(filters).forEach(([key,value])=>{if(value&&!(kind==="audit"&&["vendor","status","search"].includes(key)))params[key]=value});
   const r=await api.get("/reports/",{params,responseType:"blob"});
   const url=URL.createObjectURL(r.data),a=document.createElement("a");a.href=url;a.download=`${kind}.csv`;a.click();URL.revokeObjectURL(url);
  }catch(err){setReportError(err.response?.data?.detail||"Could not download this report.")}
 };
 return <>
 <PageHeader title="Reports" subtitle="Download operational and audit reports"/>
 {reportError&&<div className="alert error">{reportError}</div>}
 <section className="panel report-filters"><div className="panel-head"><h3>Report filters</h3><span>Applied to invoice reports; audit accepts date range</span></div><div className="toolbar"><input aria-label="Search reports" placeholder="Invoice or vendor search" value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})}/><input aria-label="From date" type="date" value={filters.date_from} onChange={e=>setFilters({...filters,date_from:e.target.value})}/><input aria-label="To date" type="date" value={filters.date_to} onChange={e=>setFilters({...filters,date_to:e.target.value})}/><select aria-label="Filter by vendor" value={filters.vendor} onChange={e=>setFilters({...filters,vendor:e.target.value})}><option value="">All vendors</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select><select aria-label="Filter by status" value={filters.status} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">All statuses</option>{["CAPTURED","VALIDATION_FAILED","MATCH_PENDING","MATCHED","EXCEPTION","PENDING_APPROVAL","APPROVED","REJECTED","PAID"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select><button className="secondary" onClick={()=>setFilters({search:"",date_from:"",date_to:"",vendor:"",status:""})}>Clear</button></div></section>
 <div className="report-grid">{reports.map(([kind,title,desc,Icon])=><div className="report-card" key={kind}><div className="report-icon"><Icon/></div><h3>{title}</h3><p>{desc}</p><button className="secondary" onClick={()=>download(kind)}><FileDown/>Download CSV</button></div>)}</div>
 <section className="panel audit-panel"><div className="panel-head"><h3>Audit log</h3><span>Immutable operational trail</span></div><p>All create, validation, approval and payment actions are stored in the system audit log. Use the API at <code>/api/audit-logs/</code> for full records.</p></section>
 <section className="panel audit-panel"><div className="panel-head"><h3>External integrations</h3><span>Configuration status; no provider credentials are bundled</span></div>
  {integrationError&&user?.role==="ADMIN"&&<p className="alert error">{integrationError}</p>}
  {!integrations?<Loader/>:<div className="integration-list">{Object.entries(integrations).map(([name,value])=><div key={name}><b>{name.toUpperCase()}</b><span>{value.configured?"Configured":"Not configured"}</span><StatusTag configured={value.configured}/></div>)}</div>}
  {user?.role==="ADMIN"&&<div className="table-panel"><table><thead><tr><th>Provider</th><th>Entity</th><th>Status</th><th>Last attempt</th><th>Response</th></tr></thead><tbody>{deliveryRows.length?deliveryRows.map(row=><tr key={row.id}><td>{row.provider}</td><td>{row.entity_type} #{row.entity_id}</td><td>{row.status}</td><td>{new Date(row.attempted_at).toLocaleString()}</td><td>{row.response_summary||row.response_status||"—"}</td></tr>):<tr><td colSpan="5">No external delivery attempts recorded.</td></tr>}</tbody></table></div>}
 </section>
 </>;
}

function StatusTag({configured}){return <span className={`status ${configured?"active":"pending"}`}>{configured?"Ready":"Needs credentials"}</span>}
