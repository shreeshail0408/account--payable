import React,{useEffect,useState} from "react";
import api from "../services/api";
import {PageHeader,Loader,Empty,Status} from "../components/UI";

const empty={username:"",email:"",first_name:"",last_name:"",role:"AP_CLERK",password:""};

export default function Employees(){
 const [rows,setRows]=useState([]),[form,setForm]=useState(empty),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const load=()=>api.get("/employees/").then(r=>setRows(r.data)).catch(e=>setError(e.response?.data?.detail||"Could not load employee accounts.")).finally(()=>setLoading(false));
 useEffect(()=>{load()},[]);
 const create=async event=>{
  event.preventDefault();setError("");
  try{await api.post("/employees/",form);setForm(empty);await load()}
  catch(e){const data=e.response?.data;setError(typeof data==="string"?data:Object.values(data||{}).flat().join(" ")||"Could not create employee account.")}
 };
 const activate=async employee=>{
  setError("");
  try{await api.patch(`/employees/${employee.id}/activation/`,{is_active:!employee.is_active});await load()}
  catch(e){setError(e.response?.data?.detail||"Could not update employee access.")}
 };
 return <>
  <PageHeader title="Employee accounts" subtitle="Administrator-managed access; new accounts remain inactive until enabled"/>
  {error&&<div className="alert error">{error}</div>}
  <section className="panel employee-create">
   <form className="form-grid" onSubmit={create}>
    <label>Username<input required value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></label>
    <label>Email<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <label>First name<input value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})}/></label>
    <label>Last name<input value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})}/></label>
    <label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="AP_CLERK">AP Clerk</option><option value="APPROVER">Approver</option><option value="ACCOUNTANT">Accountant</option><option value="AUDITOR">Auditor</option><option value="ADMIN">Administrator</option></select></label>
    <label>Temporary password<input type="password" minLength="12" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>
    <div className="span-2"><button className="primary">Create inactive account</button></div>
   </form>
  </section>
  <div className="panel table-panel employee-table">{loading?<Loader/>:rows.length?<table><thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th/></tr></thead><tbody>{rows.map(employee=><tr key={employee.id}><td>{employee.username}</td><td>{[employee.first_name,employee.last_name].filter(Boolean).join(" ")||"—"}</td><td>{employee.email}</td><td>{employee.role}</td><td><Status value={employee.is_active?"ACTIVE":"BLOCKED"}/></td><td>{employee.role!=="ADMIN"&&<button className="link" onClick={()=>activate(employee)}>{employee.is_active?"Deactivate":"Activate"}</button>}</td></tr>)}</tbody></table>:<Empty text="No employee accounts"/>}</div>
 </>;
}
