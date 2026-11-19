import React,{useEffect,useState} from "react";
import api from "../services/api";
import {PageHeader,Status,Loader,Empty,Modal} from "../components/UI";
import {useAuth} from "../App";
export default function Payments(){
 const {user}=useAuth();const canPay=["ADMIN","ACCOUNTANT"].includes(user?.role);
 const [rows,setRows]=useState([]),[invoices,setInvoices]=useState([]),[loading,setLoading]=useState(true),[open,setOpen]=useState(false),[invoice,setInvoice]=useState(""),[paymentMethod,setPaymentMethod]=useState("BANK_TRANSFER"),[bankConfigured,setBankConfigured]=useState(false),[error,setError]=useState(""),[advice,setAdvice]=useState(null),[history,setHistory]=useState(null);
 const load=()=>api.get("/payments/").then(r=>setRows(r.data.results||r.data)).finally(()=>setLoading(false));
 useEffect(()=>{load();api.get("/invoices/",{params:{search:"APPROVED"}}).then(r=>setInvoices((r.data.results||r.data).filter(i=>i.status==="APPROVED")));api.get("/integrations/status/").then(r=>setBankConfigured(r.data.bank.configured))},[]);
 const generate=async()=>{setError("");try{await api.post("/payments/generate/",{invoice,payment_method:paymentMethod});setOpen(false);load()}catch(err){setError(err.response?.data?.detail||Object.values(err.response?.data||{}).flat().join(" ")||"Could not generate payment request.")}};
 const markDemoPaid=async(payment)=>{setError("");try{await api.post(`/payments/${payment.id}/mark_paid/`,{bank_reference:`DEMO-${payment.reference}`});load()}catch(err){setError(err.response?.data?.detail||"Could not update payment.")}};
 const submitToBank=async(payment)=>{setError("");try{await api.post(`/payments/${payment.id}/submit-bank/`);load()}catch(err){setError(err.response?.data?.detail||"Bank submission failed.")}};
 const markFailed=async payment=>{const reason=window.prompt("Describe why this payment failed:");if(!reason)return;setError("");try{await api.post(`/payments/${payment.id}/mark-failed/`,{reason});load()}catch(err){setError(err.response?.data?.detail||Object.values(err.response?.data||{}).flat().join(" ")||"Could not record payment failure.")}};
 return (
 <>
 <PageHeader title="Payments" subtitle="Payment requests, status and advice" action={canPay&&<button className="primary" onClick={()=>setOpen(true)}>Generate request</button>}/>
 {!bankConfigured&&<div className="integration-notice">Bank transfer is not configured. “Record demo payment” only updates the application and does not transfer funds.</div>}
 {error&&<div className="alert error">{error}</div>}
 <div className="panel table-panel">
  {loading ? <Loader/> : rows.length ? (
   <table><thead><tr><th>Reference</th><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Method</th><th>Status / date</th><th>Actions</th></tr></thead>
    <tbody>{rows.map(p=>
     <tr key={p.id}><td><b>{p.reference}</b></td><td>{p.invoice_number}</td><td>{p.vendor_name}</td><td>₹ {Number(p.amount).toLocaleString()}</td><td>{p.payment_method?.replaceAll("_"," ")}</td><td><Status value={p.status}/><small>{p.processed_at?new Date(p.processed_at).toLocaleString():"Not processed"}</small></td>
      <td><button className="link" onClick={()=>setAdvice(p)}>Payment advice</button><button className="link" onClick={()=>setHistory(p)}>History</button>{canPay&&bankConfigured&&["REQUESTED","SCHEDULED"].includes(p.status)&&<button className="link" onClick={()=>submitToBank(p)}>Submit to bank</button>}{canPay&&["REQUESTED","SCHEDULED","PROCESSING"].includes(p.status)&&<><button className="link" onClick={()=>markDemoPaid(p)}>Record demo status</button><button className="link" onClick={()=>markFailed(p)}>Mark failed</button></>}</td>
     </tr>)}</tbody>
   </table>
  ) : <Empty text="No payment requests"/>}
 </div>
 <Modal open={canPay&&open} title="Generate payment request" onClose={()=>setOpen(false)}><div className="form-grid"><label className="span-2">Approved invoice<select value={invoice} onChange={e=>setInvoice(e.target.value)}><option value="">Select invoice</option>{invoices.map(i=><option key={i.id} value={i.id}>{i.invoice_number} — ₹{i.total_amount}</option>)}</select></label><label className="span-2">Proposed payment method<select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="UPI">UPI</option><option value="OTHER">Other</option></select></label><div className="form-actions"><button className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary" disabled={!invoice} onClick={generate}>Generate</button></div></div></Modal>
 <Modal open={!!advice} title={`Payment advice — ${advice?.reference||""}`} onClose={()=>setAdvice(null)}><div className="ocr-preview"><pre>{advice?.advice||"No payment advice is available."}</pre></div></Modal>
 <Modal open={!!history} title={`Payment history — ${history?.reference||""}`} onClose={()=>setHistory(null)}><div className="table-panel"><table><thead><tr><th>When</th><th>From</th><th>To</th><th>By</th><th>Note</th></tr></thead><tbody>{(history?.status_events||[]).map(event=><tr key={event.id}><td>{new Date(event.changed_at).toLocaleString()}</td><td>{event.previous_status||"—"}</td><td>{event.new_status}</td><td>{event.changed_by_name||"System"}</td><td>{event.note}</td></tr>)}</tbody></table></div><p className="integration-notice">Payment status records are not proof of bank settlement. Verify settlement with your authorized payment provider.</p></Modal>
  </>
 );
}
