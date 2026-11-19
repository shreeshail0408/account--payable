import React,{useEffect,useState} from "react";
import api from "../services/api";
import {PageHeader,Status,Loader,Empty,Modal} from "../components/UI";
import {Plus,Search} from "lucide-react";
import {useAuth} from "../App";
export default function PurchaseOrders(){
 const {user}=useAuth();const canManage=["ADMIN","AP_CLERK"].includes(user?.role);
 const [rows,setRows]=useState([]),[vendors,setVendors]=useState([]),[loading,setLoading]=useState(true),[q,setQ]=useState(""),[open,setOpen]=useState(false);
 const [form,setForm]=useState({number:"",vendor:"",order_date:"",expected_date:"",total_amount:"",status:"OPEN",line_description:"",line_quantity:"",line_unit_price:""});
 const load=()=>api.get("/purchase-orders/",{params:{search:q}}).then(r=>setRows(r.data.results||r.data)).finally(()=>setLoading(false));
 useEffect(()=>{load();api.get("/vendors/").then(r=>setVendors(r.data.results||r.data))},[q]);
 const submit=async(e)=>{
  e.preventDefault();
  const {line_description,line_quantity,line_unit_price,...po}=form;
  if(line_description&&line_quantity&&line_unit_price){
   po.lines=[{description:line_description,quantity:line_quantity,unit_price:line_unit_price}];
  }
  await api.post("/purchase-orders/",po);setOpen(false);load();
 };
 return <>
 <PageHeader title="Purchase Orders" subtitle="PO master and invoice matching" action={canManage&&<button className="primary" onClick={()=>setOpen(true)}><Plus/>Create PO</button>}/>
 <div className="toolbar"><div className="search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search purchase orders"/></div></div>
 <div className="panel table-panel">
  {loading ? <Loader/> : rows.length ? (
   <table><thead><tr><th>PO number</th><th>Vendor</th><th>Order date</th><th>Amount</th><th>Status</th></tr></thead>
    <tbody>{rows.map(p=><tr key={p.id}><td><b>{p.number}</b></td><td>{p.vendor_name}</td><td>{p.order_date}</td><td>₹ {Number(p.total_amount).toLocaleString()}</td><td><Status value={p.status}/></td></tr>)}</tbody>
   </table>
  ) : <Empty text="No purchase orders"/>}
 </div>
 <Modal open={canManage&&open} title="Create purchase order" onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={submit}>
 <label>PO number<input required value={form.number} onChange={e=>setForm({...form,number:e.target.value})}/></label>
 <label>Vendor<select required value={form.vendor} onChange={e=>setForm({...form,vendor:e.target.value})}><option value="">Select vendor</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
 <label>Order date<input type="date" required value={form.order_date} onChange={e=>setForm({...form,order_date:e.target.value})}/></label>
 <label>Expected date<input type="date" value={form.expected_date} onChange={e=>setForm({...form,expected_date:e.target.value})}/></label>
 <label>Total amount<input type="number" min="0" step="0.01" required value={form.total_amount} onChange={e=>setForm({...form,total_amount:e.target.value})}/></label>
 <label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>OPEN</option><option>CLOSED</option><option>CANCELLED</option></select></label>
 <div className="span-2"><h3>Optional first PO line (needed for 3-way matching)</h3></div>
 <label>Line description<input value={form.line_description} onChange={e=>setForm({...form,line_description:e.target.value})}/></label>
 <label>Quantity<input type="number" min="0.001" step="0.001" value={form.line_quantity} onChange={e=>setForm({...form,line_quantity:e.target.value})}/></label>
 <label>Unit price<input type="number" min="0" step="0.01" value={form.line_unit_price} onChange={e=>setForm({...form,line_unit_price:e.target.value})}/></label>
 <div className="form-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="primary">Create PO</button></div>
 </form></Modal>
 </>;
}
