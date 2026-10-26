import { AVATARS, avatarSvg, readAvatar, writeAvatar, type AvatarId } from '../avatars';
import { leaveFamily, readFamily } from '../family';
import { escape } from '../format';
import { readMember, saveMember } from '../member';
import '../hydration.css';
import './device-panel.css';

// Settings card: the name and buddy the family sees (src/member.ts). Onboarding asks once; this is
// where someone who skipped it signs up, and where anyone changes them later.
export function ProfilePanel(): string {
  return '<section class="device-panel profile-panel" aria-labelledby="profile-title" data-profile-panel></section>';
}

export function bindProfilePanel(): void {
  const host = document.querySelector<HTMLElement>('[data-profile-panel]');
  if (!host) return;
  const member = readMember();
  let avatar: AvatarId = readAvatar();
  const family = readFamily();

  const draw = (message = '') => {
    host.innerHTML = `<div class="device-heading"><h2 id="profile-title">Миний профайл</h2></div>
      <p>${member ? 'Гэр бүлийн жагсаалтад ингэж харагдана.' : 'Нэр, дүрээ сонговол гэр бүлийн жагсаалтад нэгдэнэ.'}</p>
      <form data-profile-form data-transient>
        <label for="profile-name">Нэр</label>
        <input id="profile-name" name="name" maxlength="24" autocomplete="nickname" placeholder="Жишээ нь: Сараа" value="${escape(member?.name ?? '')}" required/>
        <p class="profile-label" id="profile-avatar-label">Дүр</p>
        <div class="avatar-grid profile-avatars" role="radiogroup" aria-labelledby="profile-avatar-label">${(Object.keys(AVATARS) as AvatarId[]).map(id =>
          `<button type="button" class="avatar-opt${id === avatar ? ' on' : ''}" role="radio" aria-checked="${id === avatar}" data-avatar="${id}">
            ${avatarSvg(id, 'happy', AVATARS[id].waterH * 0.45, false, `profile-av-${id}`)}<span>${AVATARS[id].name}</span></button>`).join('')}</div>
        <div class="scale-actions"><button type="submit">${member ? 'Хадгалах' : 'Бүртгүүлэх'}</button></div>
      </form>
      <p role="status">${escape(message)}</p>
      ${family ? `<p class="device-time">Гэр бүл: суурь <b>${escape(family)}</b></p><div class="scale-actions"><button type="button" data-profile-leave>Гэр бүлээс гарах</button></div>`
        : '<p class="device-time">Суурьтай холбогдоход тэр суурийн гэр бүлд нэгдэнэ.</p>'}`;
    host.querySelectorAll<HTMLButtonElement>('[data-avatar]').forEach(b => b.addEventListener('click', () => {
      const name = host.querySelector<HTMLInputElement>('#profile-name')!.value;
      avatar = b.dataset.avatar as AvatarId;
      draw();
      host.querySelector<HTMLInputElement>('#profile-name')!.value = name;
    }));
    host.querySelector<HTMLFormElement>('[data-profile-form]')!.addEventListener('submit', event => {
      event.preventDefault();
      const input = host.querySelector<HTMLInputElement>('#profile-name')!;
      if (!saveMember(input.value)) { input.focus(); return; }
      writeAvatar(avatar);
      // The home screen's next report carries the new name and buddy to the family board.
      bindProfilePanel();
      host.querySelector('[role="status"]')!.textContent = 'Хадгаллаа.';
    });
    host.querySelector('[data-profile-leave]')?.addEventListener('click', async () => {
      if (!confirm('Гэр бүлийн жагсаалтаас гарах уу? Суурьтай дахин холбогдоход буцаж нэгдэнэ.')) return;
      await leaveFamily();
      bindProfilePanel();
    });
  };
  draw();
}
