import React,{useEffect,useState} from "react";
import api from "../services/api";
import {PageHeader,Modal,Status,Loader,Empty} from "../components/UI";
import {Plus,Search} from "lucide-react";
import {useAuth} from "../App";
import {useUrlIntent} from "../hooks/useUrlIntent";

export default function Vendors(){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[modal,setModal]=useState(false),[q,setQ]=useState(()=>new URLSearchParams(window.location.search).get("search")||""),[bankVendor,setBankVendor]=useState(null),[bankForm,setBankForm]=useState({bank_name:"",bank_account:"",ifsc:""});
 const [error,setError]=useState("");
 const {user}=useAuth();
 useUrlIntent({
  onSearch: setQ,
  onNew: () => {
   if (["ADMIN","AP_CLERK"].includes(user?.role)) setModal(true);
  },
 });
 const [form,setForm]=useState({code:"",name:"",email:"",gstin:"",pan:"",status:"PENDING"});
 const load=()=>api.get("/vendors/",{params:{search:q}}).then(r=>setRows(r.data.results||r.data)).finally(()=>setLoading(false));
 useEffect(()=>{load()},[q]);
 const submit=async(e)=>{e.preventDefault();setError("");try{await api.post("/vendors/",form);setModal(false);setForm({code:"",name:"",email:"",gstin:"",pan:"",status:"PENDING"});load()}catch(err){const d=err.response?.data;setError(typeof d==="string"?d:Object.entries(d||{}).map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(" "):v}`).join(" ")||"Could not submit vendor onboarding.")}};
 const decideOnboarding=async(vendor,decision)=>{setError("");const comments=decision==="reject"?window.prompt("Enter the reason for rejecting this vendor:"):"";if(decision==="reject"&&!comments)return;if(decision==="reject"&&comments.trim().length<2){setError("Enter a rejection reason of at least two characters.");return}try{await api.post(`/vendors/${vendor.id}/${decision}_onboarding/`,decision==="reject"?{comments}:{ });load()}catch(err){setError(err.response?.data?.detail||Object.values(err.response?.data||{}).flat().join(" ")||"Could not update vendor onboarding.")}};
 const setVendorStatus=async vendor=>{const status=vendor.status==="ACTIVE"?"BLOCKED":"ACTIVE";setError("");try{await api.post(`/vendors/${vendor.id}/set-status/`,{status});await load()}catch(err){setError(err.response?.data?.detail||Object.values(err.response?.data||{}).flat().join(" ")||"Could not change vendor status.")}};
 const openBank=async vendor=>{setError("");try{const {data}=await api.get(`/vendors/${vendor.id}/bank-details/`);setBankForm({bank_name:data.bank_name||"",bank_account:"",ifsc:data.ifsc||""});setBankVendor(vendor)}catch(err){setError(err.response?.data?.detail||"Could not load bank details.")}};
 const saveBank=async event=>{event.preventDefault();setError("");try{await api.post(`/vendors/${bankVendor.id}/bank-details/`,bankForm);setBankVendor(null);await load()}catch(err){const data=err.response?.data;setError(typeof data==="string"?data:Object.values(data||{}).flat().join(" ")||"Could not save bank details.")}};
 const verifyGST=async vendor=>{setError("");try{await api.post(`/vendors/${vendor.id}/verify-gstin/`);await load()}catch(err){setError(err.response?.data?.detail||"GST verification is unavailable.")}};
 return <>
 <PageHeader title="Vendors" subtitle="Vendor onboarding and master data" action={(["ADMIN","AP_CLERK"].includes(user?.role))&&<button className="primary" onClick={()=>setModal(true)}><Plus/>Add vendor</button>}/>
 <div className="toolbar"><div className="search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search vendors"/></div></div>
 {error&&<div className="alert error">{error}</div>}
 <div className="panel table-panel">{loading?<Loader/>:rows.length?<table><thead><tr><th>Code</th><th>Vendor</th><th>GSTIN / verification</th><th>Bank details</th><th>Vendor status</th><th>Onboarding</th><th/></tr></thead><tbody>{rows.map(v=><tr key={v.id}><td>{v.code}</td><td><b>{v.name}</b><small>{v.email}</small></td><td>{v.gstin||"—"}<small>GST: {v.gst_verification_status||"UNVERIFIED"}</small></td><td>{v.bank_name||"—"}<small>{v.bank_account||"No bank account"} · {v.bank_verification_status||"UNVERIFIED"}</small></td><td><Status value={v.status}/></td><td>{v.onboarding_status?<Status value={v.onboarding_status}/>:<span>Legacy / seeded</span>}</td><td>{user?.role==="ADMIN"&&<><button className="link" onClick={()=>openBank(v)}>Manage bank</button>{v.onboarding_status==="SUBMITTED"&&<><button className="link" onClick={()=>decideOnboarding(v,"approve")}>Approve</button><button className="link" onClick={()=>decideOnboarding(v,"reject")}>Reject</button></>}{v.onboarding_status!=="SUBMITTED"&&<button className="link" onClick={()=>setVendorStatus(v)}>{v.status==="ACTIVE"?"Block":"Activate"}</button>}</>}{["ADMIN","ACCOUNTANT"].includes(user?.role)&&v.gstin&&<button className="link" onClick={()=>verifyGST(v)}>Verify GSTIN</button>}</td></tr>)}</tbody></table>:<Empty/>}</div>
 <Modal open={modal} title="Submit vendor onboarding" onClose={()=>setModal(false)}><form className="form-grid" onSubmit={submit}>
  {error&&<div className="alert error span-2">{error}</div>}
  <label>Vendor code<input required value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/></label>
  <label>Vendor name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
  <label>Email<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
  <label>GSTIN<input pattern="[A-Za-z0-9]{15}" maxLength="15" value={form.gstin} onChange={e=>setForm({...form,gstin:e.target.value.toUpperCase()})}/></label>
  <label>PAN<input maxLength="10" value={form.pan} onChange={e=>setForm({...form,pan:e.target.value.toUpperCase()})}/></label>
  <div className="span-2 onboarding-note">New vendors enter pending onboarding. An administrator must review and approve the vendor before invoices can be processed. Bank details are added separately by an administrator.</div>
  <div className="form-actions"><button type="button" className="secondary" onClick={()=>setModal(false)}>Cancel</button><button className="primary">Save vendor</button></div>
 </form></Modal>
 <Modal open={!!bankVendor} title={`Secure bank details — ${bankVendor?.name||""}`} onClose={()=>setBankVendor(null)}><form className="form-grid" onSubmit={saveBank}>
  <div className="span-2 onboarding-note">Existing account: {bankVendor?.bank_account||"not provided"}. Enter the full account number to replace it. Values are masked in vendor listings; provider verification is not configured by default.</div>
  <label>Bank name<input required value={bankForm.bank_name} onChange={e=>setBankForm({...bankForm,bank_name:e.target.value})}/></label>
  <label>Full account number<input required minLength="8" maxLength="34" value={bankForm.bank_account} onChange={e=>setBankForm({...bankForm,bank_account:e.target.value})}/></label>
  <label>IFSC<input required minLength="11" maxLength="11" value={bankForm.ifsc} onChange={e=>setBankForm({...bankForm,ifsc:e.target.value.toUpperCase()})}/></label>
  <div className="form-actions"><button type="button" className="secondary" onClick={()=>setBankVendor(null)}>Cancel</button><button className="primary">Save bank details</button></div>
 </form></Modal>
 </>;
}
