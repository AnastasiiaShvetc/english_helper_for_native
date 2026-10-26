(function(root){
  'use strict';
  const TOKEN_KEY='my-english-sync-device-v1',BACKUP_KEY='my-english-before-sync-v1';
  class ProgressSync{
    constructor({getData,applyData,onStatus,endpoint=root.ENGLISH_SYNC_ENDPOINT||'https://2-26-62-47.sslip.io/english-sync'}){
      Object.assign(this,{getData,applyData,onStatus,endpoint});
      this.token=localStorage.getItem(TOKEN_KEY)||'';this.state=this.token?'syncing':'not-connected';this.lastSync=0;this.pending=false;this.running=false;
    }
    status(state){this.state=state;this.onStatus?.(state);}
    async request(path,body,auth=false){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetch(this.endpoint+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+this.token}:{})},body:JSON.stringify(body),cache:'no-store',credentials:'omit',signal:controller.signal});
        if(!response.ok){const error=Error('sync_request_failed');error.status=response.status;throw error;}
        return await response.json();
      }finally{clearTimeout(timer);}
    }
    async start(){
      clearInterval(this.interval);
      if(location.hash.startsWith('#sync=')){
        const code=location.hash.slice(6);history.replaceState(null,'',location.pathname+location.search);
        this.status('syncing');
        try{
          const response=await this.request('/v1/pair',{code});
          if(!/^[A-Za-z0-9_-]{43}$/.test(response.token))throw Error('invalid_response');
          localStorage.setItem(TOKEN_KEY,response.token);this.token=response.token;
        }catch(e){this.status(e.status===401?'invalid-code':'offline');return;}
      }
      if(!this.token){this.status('not-connected');return;}
      // Keep the original browser data untouched in a separate local backup.
      try{if(!localStorage.getItem(BACKUP_KEY))localStorage.setItem(BACKUP_KEY,JSON.stringify(this.getData()));}
      catch{this.status('backup-error');return;}
      await this.sync();
      this.interval=setInterval(()=>{if(!document.hidden)this.sync();},15000);
      if(this.eventsBound)return;
      this.eventsBound=true;
      window.addEventListener('online',()=>this.sync());
      window.addEventListener('focus',()=>this.sync());
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.sync();});
      window.addEventListener('storage',event=>{if(event.key==='my-english-progress-v1'&&event.newValue){try{const other=JSON.parse(event.newValue);if(root.EnglishSyncData.valid(other)){this.applyData(root.EnglishSyncData.merge(this.getData(),other));this.schedule();}}catch{this.status('error');}}});
    }
    async connect(value){
      const match=String(value).trim().match(/(?:^|#sync=)([A-Za-z0-9_-]{32})$/);
      if(!match){this.status('invalid-code');return;}
      history.replaceState(null,'',location.pathname+location.search+'#sync='+match[1]);
      await this.start();
    }
    schedule(){if(!this.token)return;this.pending=true;clearTimeout(this.timer);this.timer=setTimeout(()=>this.sync(),650);}
    async sync(){
      if(!this.token)return;
      if(this.running){this.pending=true;return;}
      this.running=true;this.pending=false;this.status('syncing');
      let succeeded=false;
      try{
        const response=await this.request('/v1/sync',{data:this.getData()},true);
        if(!root.EnglishSyncData.valid(response.data))throw Error('invalid_response');
        const joined=root.EnglishSyncData.merge(this.getData(),response.data);
        if(this.applyData(joined)===false)throw Error('local_storage_failed');
        this.lastSync=Date.now();this.status('synced');succeeded=true;
      }catch(e){this.status(e.status===401?'auth-error':e.status===400?'error':'offline');}
      finally{this.running=false;if(this.pending&&succeeded)this.schedule();}
    }
    markup(){
      const titles={'not-connected':'Пока только на этом устройстве',syncing:'Сохраняем общий прогресс…',synced:'Прогресс синхронизирован',offline:'Ожидаем подключения к серверу','auth-error':'Нужно снова подключить устройство','invalid-code':'Ссылка уже использована или устарела','backup-error':'Не удалось создать резервную копию',error:'Не удалось объединить прогресс'};
      const descriptions={'not-connected':'Откройте личную ссылку подключения на этом устройстве. Уже пройденные задания будут добавлены к общему прогрессу.',syncing:'Результаты телефона и компьютера объединяются автоматически.',synced:'Занятия сохраняются на вашем сервере. Откройте приложение на другом подключённом устройстве, чтобы продолжить.',offline:'Можно продолжать занятия. Ответы остаются в браузере и отправятся автоматически, когда сервер станет доступен.','auth-error':'Локальные результаты сохранены. Для подключения потребуется новая личная ссылка.','invalid-code':'Локальные результаты сохранены. Используйте отдельную неиспользованную ссылку для этого устройства.','backup-error':'Результаты остаются на устройстве. Скачайте копию прогресса и освободите место в браузере.',error:'Локальные результаты сохранены. Скачайте резервную копию перед восстановлением данных.'};
      const connect=['not-connected','auth-error','invalid-code'].includes(this.state)?'<label for="sync-link">Личная ссылка подключения</label><input class="input" id="sync-link" type="password" autocomplete="off" placeholder="Вставьте ссылку для этого устройства"><button class="btn full" data-action="connect-sync">Подключить устройство</button>':'';
      return `<strong>${titles[this.state]||titles.error}</strong><p class="sub">${descriptions[this.state]||descriptions.error}</p>${connect}`;
    }
  }
  root.EnglishProgressSync=ProgressSync;
})(window);
