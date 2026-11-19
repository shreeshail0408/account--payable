import React,{useEffect,useState} from "react";
import api from "../services/api";
import {PageHeader,Status,Loader,Empty,Modal} from "../components/UI";
import {useAuth} from "../App";

const blankRule={name:"",min_amount:"0",max_amount:"",role:"",sequence:"1",parallel:false,escalation_hours:"24"};

export default function Approvals(){
 const [rows,setRows]=useState([]),[reminders,setReminders]=useState([]),[rules,setRules]=useState([]),[approvers,setApprovers]=useState([]);
 const [loading,setLoading]=useState(true),[selected,setSelected]=useState(null),[comments,setComments]=useState("");
 const [ruleOpen,setRuleOpen]=useState(false),[rule,setRule]=useState(blankRule),[error,setError]=useState("");
 const {user}=useAuth();
 const load=async()=>{
  setError("");
  try{
   const [approvalResponse,reminderResponse]=await Promise.all([api.get("/approvals/"),api.get("/approvals/reminders/")]);
   setRows(approvalResponse.data.results||approvalResponse.data);setReminders(reminderResponse.data);
   if(user?.role==="ADMIN"){
    const [ruleResponse,approverResponse]=await Promise.all([api.get("/approval-rules/"),api.get("/approval-rules/approvers/")]);
    setRules(ruleResponse.data.results||ruleResponse.data);setApprovers(approverResponse.data);
   }
  }catch(err){setError(err.response?.data?.detail||"Unable to load approval workflow data.")}
  finally{setLoading(false)}
 };
 useEffect(()=>{load()},[]);
 const decide=async(action)=>{
  setError("");
  if(action==="reject"&&comments.trim().length<2){setError("Enter a rejection reason of at least two characters.");return}
  try{await api.post(`/approvals/${selected.id}/${action}/`,{comments});setSelected(null);setComments("");await load()}
  catch(err){setError(err.response?.data?.detail||Object.values(err.response?.data||{}).flat().join(" ")||"Could not save approval decision.")}
 };
 const escalate=async()=>{setError("");try{await api.post("/approvals/escalate-overdue/");await load()}catch(err){setError(err.response?.data?.detail||"Could not process overdue approvals.")}};
 const saveRule=async(event)=>{
  event.preventDefault();setError("");
  try{await api.post("/approval-rules/",rule);setRule(blankRule);setRuleOpen(false);await load()}
  catch(err){setError(Object.values(err.response?.data||{}).flat().join(" ")||"Could not save approval rule.")}
 };
 const deleteRule=async(id)=>{setError("");try{await api.delete(`/approval-rules/${id}/`);await load()}catch(err){setError(err.response?.data?.detail||"Could not delete approval rule.")}};
 return <>
  <PageHeader title="Approvals" subtitle="Configurable and role-based approval queue" action={<>{user?.role==="ADMIN"&&<><button className="secondary" onClick={()=>setRuleOpen(true)}>Add approval rule</button> <button className="secondary" onClick={escalate}>Process overdue</button></>}</>}/>
  {error&&<div className="alert error">{error}</div>}
  {!!reminders.length&&<div className="reminder-banner"><b>Approval reminders</b><span>{reminders.length} approval{reminders.length===1?" is":"s are"} due or overdue within the next 24 hours.</span></div>}
  {user?.role==="ADMIN"&&<section className="panel table-panel" style={{marginBottom:16}}>
   <div className="panel-head"><h3>Approval matrix</h3><span>Amount ranges and routing order</span></div>
   {loading?<Loader/>:rules.length?<table><thead><tr><th>Rule</th><th>Amount range</th><th>Approver</th><th>Sequence</th><th>Mode</th><th>Deadline</th><th/></tr></thead><tbody>{rules.map(item=><tr key={item.id}><td>{item.name}</td><td>{Number(item.min_amount).toLocaleString()} – {Number(item.max_amount).toLocaleString()}</td><td>{approvers.find(candidate=>candidate.id===item.role)?.username||`User #${item.role}`}</td><td>{item.sequence}</td><td>{item.parallel?"Parallel":"Sequential"}</td><td>{item.escalation_hours}h</td><td><button className="link" onClick={()=>deleteRule(item.id)}>Delete</button></td></tr>)}</tbody></table>:<Empty text="No approval rules configured"/>}
  </section>}
  <div className="panel table-panel">
   {loading?<Loader/>:rows.length?<table><thead><tr><th>Invoice</th><th>Approver</th><th>Sequence</th><th>Status</th><th>Due</th><th/></tr></thead><tbody>{rows.map(item=><tr key={item.id}><td><b>{item.invoice_number}</b></td><td>{item.approver_name}</td><td>{item.sequence}</td><td><Status value={item.status}/></td><td>{item.due_at?new Date(item.due_at).toLocaleString():"—"}</td><td>{user?.role==="APPROVER"&&["PENDING","ESCALATED"].includes(item.status)&&<button className="link" onClick={()=>setSelected(item)}>Review</button>}</td></tr>)}</tbody></table>:<Empty text="No approval records"/>}
  </div>
  <Modal open={!!selected} title={`Review ${selected?.invoice_number||""}`} onClose={()=>setSelected(null)}><div className="form-grid"><label className="span-2">Comments<textarea value={comments} onChange={event=>setComments(event.target.value)} placeholder="A rejection reason is required"/></label><div className="form-actions"><button className="danger" disabled={comments.trim().length<2} onClick={()=>decide("reject")}>Reject</button><button className="primary" onClick={()=>decide("approve")}>Approve</button></div></div></Modal>
  <Modal open={ruleOpen} title="Add approval rule" onClose={()=>setRuleOpen(false)}><form className="form-grid" onSubmit={saveRule}>
   <label className="span-2">Rule name<input required value={rule.name} onChange={event=>setRule({...rule,name:event.target.value})}/></label>
   <label>Minimum amount<input type="number" min="0" step="0.01" required value={rule.min_amount} onChange={event=>setRule({...rule,min_amount:event.target.value})}/></label>
   <label>Maximum amount<input type="number" min="0" step="0.01" required value={rule.max_amount} onChange={event=>setRule({...rule,max_amount:event.target.value})}/></label>
   <label>Approver<select required value={rule.role} onChange={event=>setRule({...rule,role:event.target.value})}><option value="">Select approver</option>{approvers.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.username}</option>)}</select></label>
   <label>Sequence<input type="number" min="1" step="1" required value={rule.sequence} onChange={event=>setRule({...rule,sequence:event.target.value})}/></label>
   <label>Escalation after (hours)<input type="number" min="1" step="1" required value={rule.escalation_hours} onChange={event=>setRule({...rule,escalation_hours:event.target.value})}/></label>
   <label>Routing<select value={rule.parallel?"parallel":"sequential"} onChange={event=>setRule({...rule,parallel:event.target.value==="parallel"})}><option value="sequential">Sequential</option><option value="parallel">Parallel</option></select></label>
   <div className="form-actions"><button type="button" className="secondary" onClick={()=>setRuleOpen(false)}>Cancel</button><button className="primary">Save rule</button></div>
  </form></Modal>
 </>;
}
