import React,{useEffect,useMemo,useState} from "react";
import api from "../services/api";
import {useAuth} from "../App";
import {PageHeader,Modal,Loader,Empty} from "../components/UI";
import {Plus} from "lucide-react";

export default function GoodsReceipts(){
 const [rows,setRows]=useState([]),[orders,setOrders]=useState([]),[loading,setLoading]=useState(true),[open,setOpen]=useState(false),[error,setError]=useState("");
 const [form,setForm]=useState({number:"",purchase_order:"",received_date:new Date().toISOString().slice(0,10),notes:""});
 const [quantities,setQuantities]=useState({});
 const {user}=useAuth();
 const load=()=>api.get("/grns/").then(r=>setRows(r.data.results||r.data)).finally(()=>setLoading(false));
 useEffect(()=>{load();api.get("/purchase-orders/").then(r=>setOrders(r.data.results||r.data))},[]);
 const selectedOrder=orders.find(po=>String(po.id)===String(form.purchase_order));
 const availableLines=useMemo(()=>selectedOrder?.lines||[],[selectedOrder]);
 const submit=async(e)=>{
  e.preventDefault();setError("");
  const lines=availableLines.map(line=>({po_line:line.id,quantity:quantities[line.id]||"0"})).filter(line=>Number(line.quantity)>0);
  if(!lines.length){setError("Enter a received quantity for at least one PO line.");return}
  try{
   await api.post("/grns/",{number:form.number,purchase_order:form.purchase_order,received_date:form.received_date,received_by:user.id,notes:form.notes,lines});
   setOpen(false);setForm({number:"",purchase_order:"",received_date:new Date().toISOString().slice(0,10),notes:""});setQuantities({});load();
  }catch(err){setError(err.response?.data?.lines?.[0]||err.response?.data?.detail||"Could not create goods receipt.");}
 };
 return <>
  <PageHeader title="Goods receipts" subtitle="Record delivered quantities for purchase orders" action={user?.role==="AP_CLERK"&&<button className="primary" onClick={()=>setOpen(true)}><Plus/>Record receipt</button>}/>
  <div className="panel table-panel">{loading?<Loader/>:rows.length?
   <table><thead><tr><th>GRN</th><th>Purchase order</th><th>Received date</th><th>Notes</th></tr></thead><tbody>{rows.map(grn=><tr key={grn.id}><td><b>{grn.number}</b></td><td>{orders.find(po=>po.id===grn.purchase_order)?.number||`PO #${grn.purchase_order}`}</td><td>{grn.received_date}</td><td>{grn.notes||"—"}</td></tr>)}</tbody></table>
   :<Empty text="No goods receipts recorded"/>}</div>
  <Modal open={user?.role==="AP_CLERK"&&open} title="Record goods receipt" onClose={()=>setOpen(false)}>
   <form className="form-grid" onSubmit={submit}>
    {error&&<div className="alert error span-2">{error}</div>}
    <label>GRN number<input required value={form.number} onChange={e=>setForm({...form,number:e.target.value})}/></label>
    <label>Purchase order<select required value={form.purchase_order} onChange={e=>{setForm({...form,purchase_order:e.target.value});setQuantities({})}}><option value="">Select PO</option>{orders.filter(po=>po.status==="OPEN").map(po=><option key={po.id} value={po.id}>{po.number} — {po.vendor_name}</option>)}</select></label>
    <label>Received date<input type="date" required value={form.received_date} onChange={e=>setForm({...form,received_date:e.target.value})}/></label>
    <label className="span-2">Notes<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
    {availableLines.length? <div className="span-2"><h3>Received PO lines</h3>{availableLines.map(line=><label key={line.id}>{line.description} (remaining {Number(line.quantity)-Number(line.received_quantity)})<input type="number" min="0" max={Number(line.quantity)-Number(line.received_quantity)} step="0.001" value={quantities[line.id]||""} onChange={e=>setQuantities({...quantities,[line.id]:e.target.value})}/></label>)}</div>
     : form.purchase_order&&<div className="alert error span-2">This PO has no line items. Create a PO with a line before recording a receipt.</div>}
    <div className="form-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary">Save receipt</button></div>
   </form>
  </Modal>
 </>;
}
