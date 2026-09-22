/* Shared CRM screens; external messaging is always performed by the backend. */
(() => {
  let h, data, currentPage, selectedClient=null, selectedConversation=null;
  let clientTab='All',activityView='Calendar',teamView='Members',connectView='Facebook';
  let calendarDate=new Date(),selectedDay='',teamFilter='',staleDays=14;
  let messages=[],hasMore=false,canReply=false,polling=false,requestEpoch=0;
  const drafts=new Map();
  const e=v=>h.esc(v);
  const c=()=>data.collaboration;
  const tabs=(items,selected,action)=>`<div class="collab-tabs" role="group" aria-label="Views">${items.map(name=>`<button class="${selected===name?'selected':''}" data-collab="${action}" data-value="${e(name)}">${e(name)}</button>`).join('')}</div>`;
  const button=(label,action,id='',extra='')=>`<button class="quiet-button" data-collab="${action}" data-id="${id}" ${extra}>${label}</button>`;
  const duration=v=>v==null?'—':Number(v)<60?`${Math.round(v)}s`:`${Math.round(Number(v)/60)}m`;
  const pending=t=>t.status!=='Completed';
  const dateKey=v=>{const d=new Date(v);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  function clients(){
    let rows=data.clients.filter(item=>[item.name,item.email,item.phone].some(x=>String(x||'').toLowerCase().includes(h.query.toLowerCase())));
    if(clientTab==='Uncontacted')rows=rows.filter(x=>!x.contactedAt);
    if(clientTab==='Follow-up')rows=rows.filter(x=>data.tasks.some(t=>t.clientId===x.id&&pending(t)));
    if(clientTab==='Recently added')rows=rows.filter(x=>Date.now()-new Date(x.createdAt).getTime()<7*86400000);
    return `<section class="dash-panel"><header><div><h2>Clients & relationships</h2><p class="panel-description">Click a person to open their Inbox. Use Edit to update their details.</p></div><span class="record-count">${rows.length} clients</span></header>${tabs(['All','Uncontacted','Follow-up','Recently added'],clientTab,'client-tab')}<div class="workspace-toolbar"><input id="workspace-search" type="search" value="${e(h.query)}" placeholder="Search name, email, or phone…" aria-label="Search clients"></div>${h.clientTable(rows)}<div class="client-detail-list">${rows.slice(0,30).map(x=>`<details><summary>${e(x.name)} · added ${h.date(x.createdAt)} · ${x.lastActivity?'last message '+h.date(x.lastActivity):'no messages yet'}</summary><p>${c().contacts.filter(p=>p.clientId===x.id).map(p=>`${e(p.type)}: ${e(p.value)}`).join(' · ')||'No additional contact points'}</p></details>`).join('')}</div></section>`;
  }
  function threadList(){return c().conversations.length?c().conversations.map(v=>`<button class="thread-item ${v.id===selectedConversation?'selected':''}" data-collab="thread" data-id="${v.id}"><span class="person-avatar">${e(v.clientName.slice(0,2).toUpperCase())}</span><span><strong>${e(v.clientName)}</strong><small>${e(v.platform)} · ${e(v.status)}</small><small>${v.lastMessageAt?h.date(v.lastMessageAt):'No messages yet'}</small></span>${v.unread?`<b class="unread-badge">${v.unread}</b>`:''}</button>`).join(''):h.empty('Your conversations start on Messenger','Connect your Facebook Page. New incoming messages will appear here.');}
  function reminders(clientId){const tasks=data.tasks.filter(t=>t.clientId===clientId&&pending(t));return tasks.length?`<div class="inbox-reminders"><strong>Next steps for this client</strong>${tasks.map(t=>`<div class="${new Date(t.dueAt)<=new Date()?'reminder-due':''}"><span>${new Date(t.dueAt)<=new Date()?'Due now · ':''}${e(t.title||t.type)} · ${h.date(t.dueAt)}</span><button class="text-button" data-action="complete" data-id="${t.id}">Complete</button></div>`).join('')}</div>`:'';}
  function messageHtml(){return messages.map(m=>`<div class="chat-message ${m.sender==='Agent'?'outbound':'inbound'}"><p>${e(m.text)}</p><small>${h.date(m.createdAt)}${m.sender==='Agent'?' · '+e(m.status):''}</small>${m.error?`<small class="message-error">${e(m.error)}</small>`:''}${window.cramRecords.messageActions(m,selectedConversation)}</div>`).join('')||'<p class="panel-description">No messages loaded.</p>';}
  function inbox(){
    if(selectedClient&&!data.clients.some(x=>x.id===selectedClient)){selectedClient=null;selectedConversation=null;messages=[];}
    if(!selectedClient&&c().conversations.length){selectedClient=c().conversations[0].clientId;selectedConversation=c().conversations[0].id;}
    const client=data.clients.find(x=>x.id===selectedClient);
    const channels=c().conversations.filter(v=>v.clientId===selectedClient);
    if(!channels.some(v=>v.id===selectedConversation))selectedConversation=channels[0]?.id||null;
    const conv=channels.find(v=>v.id===selectedConversation);
    const main=client?`<header class="chat-heading"><div><h2>${e(client.name)}</h2><small>Assigned to ${e(client.assignedName||'your team')}</small></div><button class="quiet-button" data-action="edit-client" data-id="${client.id}">Client details</button><button class="quiet-button" data-action="add-task" data-id="${client.id}" data-conversation="${conv?.id||''}">Schedule</button></header><div class="channel-tabs">${channels.map(v=>button(`${e(v.platform)} · ${e(v.status)}`,'thread',v.id)).join('')}</div>${reminders(client.id)}${conv?`<div class="thread-status"><div class="record-actions">${button(conv.status==='Open'?'Close conversation':'Reopen conversation','toggle-conversation',conv.id)}${window.cramRecords.control('New draft','draft-new',conv.id,`data-conversation="${conv.id}"`)}${c().canManage?window.cramRecords.control('Delete conversation','delete-conversation',conv.id):''}</div> <span id="chat-sync" role="status">Refreshing…</span></div><div class="message-scroll" id="message-scroll"><button id="older-messages" class="text-button ${hasMore?'':'hidden'}" data-collab="older">Load earlier messages</button><div id="message-list" role="log" aria-label="Conversation messages">${messageHtml()}</div></div><form id="reply-form"><label for="reply-text" class="sr-only">Your reply</label><textarea id="reply-text" maxlength="2000" rows="2" placeholder="Reply through Messenger…" required>${e(drafts.get(conv.id)||'')}</textarea><button class="btn-primary" type="submit">Send reply →</button><small id="reply-guidance">Replies require a connected Page and an open Messenger reply window.</small><p id="reply-error" class="form-error" role="alert"></p></form>`:h.empty('No Messenger conversation yet','This client can message your connected Facebook Page. A saved contact point alone does not create a live chat.')}`:h.empty('A conversation can become a home','Select an incoming conversation to read and reply.');
    if(conv)queueMicrotask(()=>refreshMessages(false,true));
    return `<section class="inbox-layout"><aside class="inbox-threads"><header><h2>Inbox</h2><small>Facebook Messenger conversations</small></header><div id="thread-list">${threadList()}</div></aside><div class="chat-pane">${main}</div></section>`;
  }
  async function refreshMessages(older=false,markRead=false){
    const id=selectedConversation,epoch=++requestEpoch;if(!id||currentPage!=='Inbox')return;
    try {
      const result=await h.api(`/conversations/${id}/messages${older&&messages.length?'?before='+messages[0].id:''}`);
      if(epoch!==requestEpoch||id!==selectedConversation||currentPage!=='Inbox')return;
      const scroll=document.querySelector('#message-scroll');const nearBottom=!scroll||scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<70;
      const oldHeight=scroll?.scrollHeight||0;
      const earlier=messages.filter(m=>result.messages.length&&m.id<result.messages[0].id);
      messages=older?[...result.messages,...messages]:[...earlier,...result.messages];
      if(older||!earlier.length)hasMore=result.hasMore;canReply=result.canReply;
      document.querySelector('#message-list').innerHTML=messageHtml();
      document.querySelector('#older-messages').classList.toggle('hidden',!hasMore);
      document.querySelector('#reply-form button').disabled=!canReply;
      document.querySelector('#reply-guidance').textContent=canReply?'Sent through your connected Facebook Page.':'Reply unavailable: connect the Page or wait for a new client message to open the standard reply window.';
      document.querySelector('#chat-sync').textContent='Up to date · checks every 5 seconds';
      if(older)scroll.scrollTop=scroll.scrollHeight-oldHeight;else if(nearBottom||markRead)scroll.scrollTop=scroll.scrollHeight;
      if(markRead)await h.api(`/conversations/${id}/read`,'POST',{});
    }catch(error){const sync=document.querySelector('#chat-sync');if(sync)sync.textContent=error.message;}
  }
  function calendar(tasks){
    const first=new Date(calendarDate.getFullYear(),calendarDate.getMonth(),1),last=new Date(first.getFullYear(),first.getMonth()+1,0);
    const cells=Array.from({length:first.getDay()},()=>'<div class="calendar-blank"></div>');
    for(let n=1;n<=last.getDate();n++){const key=dateKey(new Date(first.getFullYear(),first.getMonth(),n));const items=tasks.filter(t=>dateKey(t.dueAt)===key);cells.push(`<div class="calendar-day ${key===dateKey(new Date())?'today':''}"><button data-collab="day" data-value="${key}">${n}</button>${items.slice(0,3).map(t=>`<button class="calendar-event ${t.type==='Site visit'?'visit':''}" data-collab="client-chat" data-id="${t.clientId}" title="${e(t.clientName)}: ${e(t.title)}">${e(t.title||t.type)}</button>`).join('')}${items.length>3?`<small>+${items.length-3} more</small>`:''}</div>`);}
    return `<div class="calendar-nav">${button('←','month','-1')}<h3>${first.toLocaleDateString('en-PH',{month:'long',year:'numeric'})}</h3>${button('→','month','1')}</div><div class="activity-calendar">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<div class="weekday">${d}</div>`).join('')}${cells.join('')}</div>`;
  }
  function activities(){
    const members=teamFilter?c().teams.filter(t=>t.id===Number(teamFilter)).map(t=>t.memberId):null;
    let tasks=data.tasks.filter(t=>!members||members.includes(t.assignedTo));
    let content='';
    if(activityView==='Calendar'){content=calendar(tasks)+`<h3 class="activity-subtitle">${selectedDay?e(selectedDay):'Upcoming & overdue'}</h3>`+h.taskList(tasks.filter(t=>selectedDay?dateKey(t.dueAt)===selectedDay:pending(t)));}
    else if(activityView==='History')content=`<div class="history-list">${c().activities.map(a=>`<article><time>${h.date(a.createdAt)}</time><strong>${e(a.description)}</strong><span>${e(a.actor||'System')}</span>${a.clientId?button('Open client Inbox','client-chat',a.clientId):''}</article>`).join('')||h.empty('Your activity history starts here','Client changes, assignments and scheduled work will be recorded.')}</div>`;
    else {tasks=tasks.filter(t=>activityView==='Completed'?!pending(t):pending(t));if(activityView==='Overdue')tasks=tasks.filter(t=>new Date(t.dueAt)<new Date());if(activityView==='Appointments')tasks=tasks.filter(t=>['Site visit','Online meeting'].includes(t.type));content=h.taskList(tasks);}
    const teams=[...new Map(c().teams.map(t=>[t.id,t])).values()];
    return `<section class="dash-panel"><header><div><h2>Activities</h2><p class="panel-description">Site visits, calls, follow-ups, and the history behind them.</p></div><button class="quiet-button" data-action="add-task">+ Schedule</button></header>${tabs(['Calendar','Upcoming','Overdue','Appointments','Completed','History'],activityView,'activity-tab')}<div class="workspace-toolbar"><label>Filter by team <select id="activity-team"><option value="">All accessible teams</option>${teams.map(t=>`<option value="${t.id}" ${teamFilter===String(t.id)?'selected':''}>${e(t.name)}</option>`).join('')}</select></label></div>${content}</section>`;
  }
  function teams(){
    const groups=[...new Map(c().teams.map(t=>[t.id,t])).values()];
    let content='';
    if(teamView==='Members')content=`<div class="member-grid">${c().members.map(m=>{const owned=data.clients.filter(x=>x.assignedTo===m.id),perf=c().performance.find(p=>p.agentId===m.id);return `<article class="member-card"><div class="person-avatar">${e(m.name.slice(0,2).toUpperCase())}</div><h3>${e(m.name)}</h3><p>${e(m.email)}</p><small>${e(m.role)}</small><dl><div><dt>Assigned clients</dt><dd>${owned.length}</dd></div><div><dt>Contacted</dt><dd>${owned.filter(x=>x.contactedAt).length}</dd></div><div><dt>Avg. response</dt><dd>${duration(perf?.responseSeconds)}</dd></div><div><dt>Tasks</dt><dd>${data.tasks.filter(t=>t.assignedTo===m.id).length}</dd></div></dl><details><summary>View assigned clients</summary>${owned.map(x=>button(e(x.name),'client-chat',x.id)).join('')||'<p>No assigned clients.</p>'}</details>${window.cramRecords.memberActions(m)}</article>`;}).join('')}</div>`;
    if(teamView==='Subteams')content=`<div class="member-grid">${groups.map(t=>`<article class="member-card"><h3>${e(t.name)}${!t.parentId?' · Workspace':''}</h3>${window.cramRecords.teamActions(t)}${c().teams.filter(x=>x.id===t.id&&x.memberId).map(x=>`<div class="membership-row"><span>${e(c().members.find(m=>m.id===x.memberId)?.name||'Workspace member')}</span>${c().canManage&&t.parentId?button('Remove','remove-member',t.id,`data-member="${x.memberId}"`):''}</div>`).join('')||'<p>No members yet.</p>'}${c().canManage&&t.parentId?`<form class="member-add" data-team="${t.id}"><select name="userId" aria-label="Member to add">${c().members.map(m=>`<option value="${m.id}">${e(m.name)}</option>`).join('')}</select><button class="quiet-button">Add member</button></form>`:''}</article>`).join('')||h.empty('Organize your agents','Create a subteam and add agents from this workspace.')}</div>`;
    if(teamView==='Lead assignment')content=`<div class="assignment-list">${data.clients.map(x=>`<article><span><strong>${e(x.name)}</strong><small>${e(x.email||x.phone||'No contact added')}</small></span><select class="assign-agent" data-client="${x.id}" aria-label="Assign ${e(x.name)}" ${c().canManage?'':'disabled'}>${c().members.map(m=>`<option value="${m.id}" ${x.assignedTo===m.id?'selected':''}>${e(m.name)}</option>`).join('')}</select></article>`).join('')||h.empty('No leads to assign','Add a client or connect Messenger to receive new inquiries.')}</div>`;
    if(teamView==='Invitations')content=`<p class="panel-description">Invitation links let new agents join your workspace. They are not emailed automatically.</p><div class="history-list">${c().invitations.map(i=>`<article><strong>${e(i.email)}</strong><span>${i.acceptedAt?'Accepted':new Date(i.expiresAt)<new Date()?'Expired':'Pending'}</span><time>Expires ${h.date(i.expiresAt)}</time></article>`).join('')||'<p>No invitations yet.</p>'}</div>`;
    return `<section class="dash-panel"><header><div><h2>Your team</h2><p class="panel-description">Share the work. Keep ownership clear.</p></div>${c().canManage?`<div class="header-actions">${button('Create subteam','new-team')}${button('Invite agent','invite')}</div>`:''}</header>${tabs(['Members','Subteams','Lead assignment','Invitations'],teamView,'team-tab')}${content}</section>`;
  }
  function connect(){
    return `<section class="dash-panel"><header><div><h2>Connect your conversations</h2><p class="panel-description">Clients stay on Messenger. Your agents work here in CRAM.</p></div></header>${tabs(['Facebook','TikTok'],connectView,'connect-tab')}${connectView==='TikTok'?`<div class="connection-notice"><h3>TikTok messaging is not connected</h3><p>TikTok Login Kit grants profile/video access, not Inbox messaging. Messaging requires an eligible integration and permissions. No placeholder authorization link is used.</p><a href="https://developers.tiktok.com/docs/en/login-kit-manage-user-access-tokens" target="_blank" rel="noopener noreferrer">Read TikTok permissions documentation ↗</a></div>`:c().canManage?`<div class="connect-grid"><div><h3>Facebook Page connection</h3><p class="panel-description">Use your Page access token and Meta app secret. These are encrypted on the server and never returned to the browser.</p><a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer">Open Graph API Explorer ↗</a><form id="facebook-connect"><label>Page access token<input name="pageToken" type="password" autocomplete="off" required maxlength="5000"></label><label>Meta app secret<input name="appSecret" type="password" autocomplete="off" required maxlength="255"></label><p class="form-error" role="alert"></p><button class="btn-primary">Validate & save Page</button></form><div id="connection-result"></div></div><div><h3>Connected Pages</h3>${c().connections.map(p=>`<article class="connection-card"><strong>${e(p.pageName)}</strong><span>${e(p.status)}</span><small>Page ID ${e(p.pageId)}</small><p>Callback path</p><code>/api/messenger/webhook/${e(p.webhookKey)}</code><small>${p.lastEventAt?'Last event '+h.date(p.lastEventAt):'Waiting for signed Facebook events'}</small></article>`).join('')||'<p class="panel-description">No Pages connected yet.</p>'}<div class="connection-notice"><strong>Live setup</strong><p>A public HTTPS callback, Meta messaging permissions and a Page webhook subscription are required. Localhost cannot receive Facebook events directly.</p><p>Subscribe to messages for the selected Page. Existing message history is not imported by this connection.</p></div></div></div>`:h.empty('A manager connects the Page','Ask your workspace owner to configure Facebook here.')}</section>`;
  }
  function analytics(){
    const samples=c().performance.reduce((n,p)=>n+Number(p.responseSamples),0),avg=samples?c().performance.reduce((n,p)=>n+Number(p.responseSeconds)*Number(p.responseSamples),0)/samples:null;
    const counts=[['Total clients',data.clients.length],['Open conversations',c().conversations.filter(x=>x.status==='Open').length],['Average response',duration(avg)],['Tasks due today',data.tasks.filter(t=>pending(t)&&dateKey(t.dueAt)===dateKey(new Date())).length]];
    const platforms=[...new Set(c().volume.map(v=>v.platform))],days=Array.from({length:30},(_,i)=>dateKey(Date.now()-(29-i)*86400000)),colors=['#377861','#7299b9','#cfaa71','#9b80b3','#bc7962'];
    const max=Math.max(1,...c().volume.map(v=>Number(v.count)));
    const chart=platforms.length?`<svg class="volume-chart" viewBox="0 0 660 180" role="img" aria-label="Daily messages by platform over the last 30 days"><path d="M30 10V150H650" fill="none" stroke="#dfe7dd"/>${platforms.map((p,i)=>`<polyline fill="none" stroke="${colors[i%colors.length]}" stroke-width="2" points="${days.map((d,j)=>`${30+j*620/29},${150-(Number(c().volume.find(v=>v.day===d&&v.platform===p)?.count)||0)/max*125}`).join(' ')}"/>`).join('')}<text x="4" y="25">${max}</text><text x="4" y="150">0</text><text x="30" y="175">${days[0]}</text><text x="565" y="175">${days.at(-1)}</text></svg><div class="chart-legend">${platforms.map((p,i)=>`<span style="color:${colors[i%colors.length]}">● ${e(p)}</span>`).join('')}</div>`:h.empty('Message activity will appear here','Connect Messenger and receive conversations to start measuring volume.');
    const stages={Lead:0,Active:0,'Needs follow-up':0,Dormant:0};
    data.clients.forEach(x=>{const label=!x.contactedAt?'Lead':data.tasks.some(t=>t.clientId===x.id&&pending(t)&&new Date(t.dueAt)<new Date())?'Needs follow-up':Date.now()-new Date(x.lastActivity||x.createdAt).getTime()>staleDays*86400000?'Dormant':'Active';stages[label]++;});
    const stale=c().conversations.filter(v=>v.status==='Open'&&v.lastMessageAt&&Date.now()-new Date(v.lastMessageAt).getTime()>staleDays*86400000);
    return `<section class="metric-grid">${counts.map(([label,value])=>`<article class="metric-card"><span class="metric-label">${label}</span><strong>${value}</strong><small>Based on recorded activity</small></article>`).join('')}</section><section class="dash-panel"><header><h2>Message volume · last 30 days</h2></header>${chart}</section><div class="analytics-grid collab-spacing"><section class="dash-panel"><h2>Agent performance</h2><p class="panel-description">Response time pairs incoming messages with the next agent reply sent through CRAM. Unanswered messages are excluded.</p>${c().members.map(m=>{const p=c().performance.find(x=>x.agentId===m.id),tasks=data.tasks.filter(t=>t.assignedTo===m.id),done=tasks.filter(t=>!pending(t)).length;return `<div class="performance-row"><strong>${e(m.name)}</strong><span>${p?.handled||0} conversations</span><span>${duration(p?.responseSeconds)} response</span><span>${tasks.length?Math.round(done/tasks.length*100)+'%':'—'} tasks complete</span><progress value="${done}" max="${tasks.length||1}" aria-label="Task completion for ${e(m.name)}"></progress></div>`;}).join('')}</section><section class="dash-panel"><h2>Client engagement</h2><p class="panel-description">Based on contact history, overdue tasks, and time since last activity.</p>${Object.entries(stages).map(([label,count])=>`<div class="engagement-row"><span>${label}</span><b>${count}</b><progress value="${count}" max="${data.clients.length||1}" aria-label="${label}"></progress></div>`).join('')}</section></div><section class="dash-panel collab-spacing"><header><h2>Stale conversations</h2><label>No messages in <select id="stale-days">${[7,14,30].map(n=>`<option value="${n}" ${n===staleDays?'selected':''}>${n} days</option>`).join('')}</select></label></header>${stale.map(v=>`<div class="membership-row"><span>${e(v.clientName)} · last sender ${e(v.lastSender)} · ${h.date(v.lastMessageAt)}</span>${button('Open Inbox','thread',v.id)}</div>`).join('')||'<p class="panel-description">No stale open conversations in this period.</p>'}</section><section class="dash-panel collab-spacing"><header><h2>Upcoming & overdue tasks</h2><button class="text-button" data-page="Activities">Filter by team in Activities →</button></header>${h.taskList(data.tasks.filter(pending))}</section>`;
  }
  function modal(kind){
    const groups=[...new Map(c().teams.map(t=>[t.id,t])).values()];
    const fields=kind==='invite'?`<label>Agent email<input name="email" type="email" maxlength="80" required></label><label>Team<select name="teamId">${groups.map(t=>`<option value="${t.id}">${e(t.name)}</option>`).join('')}</select></label>`:`<label>Subteam name<input name="name" maxlength="50" required></label><fieldset><legend>Add agents (optional)</legend>${c().members.map(m=>`<label class="checkbox-label"><input type="checkbox" name="members" value="${m.id}">${e(m.name)}</label>`).join('')}</fieldset>`;
    h.dialog().innerHTML=`<div class="dialog-heading"><h2 id="record-title">${kind==='invite'?'Invite an agent':'Create a subteam'}</h2><button class="dialog-close" data-action="close-dialog" aria-label="Close">×</button></div><form id="team-dialog-form" data-kind="${kind}">${fields}<p class="form-error" role="alert"></p><button class="btn-primary">${kind==='invite'?'Create invitation link':'Create subteam'}</button></form><div id="invitation-result"></div>`;h.dialog().showModal();
  }
  async function run(action){try{await action();await h.load();}catch(error){h.toast(error.message);}}
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-collab]');if(!target||!h)return;
    event.preventDefault();const action=target.dataset.collab,value=target.dataset.value,id=Number(target.dataset.id);
    if(action==='client-tab'){clientTab=value;h.render();}
    if(action==='activity-tab'){activityView=value;selectedDay='';h.render();}
    if(action==='team-tab'){teamView=value;h.render();}
    if(action==='connect-tab'){connectView=value;h.render();}
    if(action==='month'){calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+id,1);selectedDay='';h.render();}
    if(action==='day'){selectedDay=value;h.render();}
    if(action==='client-chat'){selectClient(id);h.navigate('Inbox');}
    if(action==='thread'){const thread=c().conversations.find(v=>v.id===id);if(!thread)return;selectedClient=thread.clientId;selectedConversation=id;messages=[];h.navigate('Inbox');}
    if(action==='older')refreshMessages(true);
    if(action==='toggle-conversation')run(()=>h.api(`/conversations/${id}`,'PATCH',{status:c().conversations.find(v=>v.id===id).status==='Open'?'Closed':'Open'}));
    if(action==='new-team')modal('team');
    if(action==='invite')modal('invite');
    if(action==='remove-member')run(()=>h.api(`/teams/${id}/members`,'PUT',{userId:Number(target.dataset.member),add:false}));
    if(action==='remove-contact')run(async()=>{await h.api(`/clients/${target.dataset.client}/contacts/${id}`,'DELETE');h.dialog().close();});
  });
  document.addEventListener('change',event=>{
    if(!h)return;const el=event.target;
    if(el.id==='activity-team'){teamFilter=el.value;h.render();}
    if(el.id==='stale-days'){staleDays=Number(el.value);h.render();}
    if(el.classList.contains('assign-agent'))run(()=>h.api(`/clients/${el.dataset.client}/assignment`,'PUT',{userId:Number(el.value)}));
  });
  document.addEventListener('input',event=>{if(event.target.id==='reply-text')drafts.set(selectedConversation,event.target.value);});
  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(!h||!['reply-form','facebook-connect','team-dialog-form','contact-point-form'].includes(form.id)&&!form.classList.contains('member-add'))return;
    event.preventDefault();const submit=form.querySelector('button[type=submit],button:not([type])');if(submit?.disabled)return;
    const error=form.querySelector('.form-error');if(error)error.textContent='';if(submit)submit.disabled=true;
    const values=Object.fromEntries(new FormData(form));
    try {
      if(form.id==='reply-form'){
        const id=selectedConversation;const text=document.querySelector('#reply-text').value.trim();if(!text)return;
        await h.api(`/conversations/${id}/messages`,'POST',{text,requestId:crypto.randomUUID()});drafts.delete(id);document.querySelector('#reply-text').value='';await refreshMessages();
      }
      if(form.id==='facebook-connect'){
        const result=await h.api('/connections/facebook','POST',values);form.reset();
        document.querySelector('#connection-result').innerHTML=`<div class="connection-notice"><strong>${e(result.pageName)} credentials saved</strong><p>Copy these into Meta’s webhook settings. The verify token is shown only now.</p><label>Callback path<input readonly value="${e(result.callbackPath)}"></label><label>Webhook verify token<input readonly value="${e(result.verifyToken)}"></label><p>${e(result.message)}</p></div>`;
      }
      if(form.id==='team-dialog-form'){
        if(form.dataset.kind==='team'){values.members=new FormData(form).getAll('members').map(Number);await h.api('/teams','POST',values);h.dialog().close();await h.load();}
        else {const result=await h.api('/invitations','POST',values);const link=location.origin+location.pathname+'#invite='+encodeURIComponent(result.token)+'&email='+encodeURIComponent(result.email);document.querySelector('#invitation-result').innerHTML=`<p class="panel-description">${e(result.message)}</p><label>Private invitation link<input readonly value="${e(link)}"></label>`;}
      }
      if(form.classList.contains('member-add')){await h.api(`/teams/${form.dataset.team}/members`,'PUT',{userId:Number(values.userId),add:true});await h.load();}
      if(form.id==='contact-point-form'){await h.api(`/clients/${form.dataset.client}/contacts`,'POST',values);h.dialog().close();await h.load();h.toast('Contact point added.');}
    }catch(err){if(error)error.textContent=err.message;else h.toast(err.message);}
    finally{if(submit)submit.disabled=false;}
  });
  function selectClient(id){selectedClient=id;selectedConversation=null;messages=[];requestEpoch++;}
  setInterval(async()=>{
    if(!h||!data||document.hidden||h.root().classList.contains('hidden')||polling)return;
    polling=true;
    try{
      if(currentPage==='Inbox'){
        const viewer=data.user.id;const [update,workspace]=await Promise.all([h.api('/collaboration'),h.api('/workspace')]);if(!h||data.user.id!==viewer||currentPage!=='Inbox')return;
        Object.assign(data,workspace,{collaboration:update});
        const list=document.querySelector('#thread-list');if(list)list.innerHTML=threadList();
        if(selectedConversation)await refreshMessages(false,false);
      }
      const due=data.tasks.filter(t=>pending(t)&&new Date(t.dueAt)<=new Date());
      for(const task of due){const key=`cram.reminder.${data.user.id}.${task.id}.${task.dueAt}`;if(!sessionStorage.getItem(key)){sessionStorage.setItem(key,'shown');h.toast(`Reminder: ${task.title||task.type} · ${task.clientName}`);break;}}
    }catch{const sync=document.querySelector('#chat-sync');if(sync)sync.textContent='Connection interrupted. Reconnecting…';}finally{polling=false;}
  },5000);
  window.cramCollab={
    render(page,workspace,helpers){h=helpers;data=workspace;currentPage=page;return ({Clients:clients,Inbox:inbox,Activities:activities,Teams:teams,Connect:connect,Analytics:analytics}[page])?.();},
    selectClient,setActivityView:view=>{activityView=view;},
    getMessage:id=>messages.find(m=>m.id===id),
    invalidateMessages(){messages=[];hasMore=false;requestEpoch++;},
    reset(){h=null;data=null;currentPage=null;selectedClient=null;selectedConversation=null;messages=[];drafts.clear();requestEpoch++;},
    contactEditor(dialog,client,workspace,helpers){
      const contacts=workspace.collaboration.contacts.filter(p=>p.clientId===client.id),esc=helpers.esc;
      dialog.insertAdjacentHTML('beforeend',`<section class="contact-editor"><h3>Contact points</h3>${contacts.map(p=>`<div class="membership-row"><span>${esc(p.type)}: ${esc(p.value)}</span><div class="record-actions">${window.cramRecords.control('Edit','edit-contact',p.id,`data-client="${client.id}"`)}${window.cramRecords.control('Delete','delete-contact',p.id,`data-client="${client.id}"`)}</div></div>`).join('')}<form id="contact-point-form" data-client="${client.id}"><label>Platform<select name="type">${['Messenger','TikTok','WhatsApp','SMS','Email','Phone'].map(t=>`<option>${t}</option>`).join('')}</select></label><label>Address, number, or account ID<input name="value" maxlength="255" required></label><p class="form-error" role="alert"></p><button class="quiet-button" type="submit">Add contact point</button></form></section>${workspace.collaboration.canManage?`<section class="record-danger-zone"><h3>Delete client</h3><p>Removes this client and its tasks, contacts, conversations, and local messages.</p>${window.cramRecords.control('Delete client permanently','delete-client',client.id)}</section>`:''}`);
    },
  };
})();
