/**
 * (?) 属性说明图标 —— hover 弹出三属性在战斗中的作用速览。
 * 选人页（属性行）与养成页（属性加点标题）共用；复用 .info-i / .info-tip 样式。
 */
import { useI18n } from './i18n.js';

export function AttrHelp({ align = 'center' }: { align?: 'center' | 'left' }) {
  const { t } = useI18n();
  return (
    <span className="info-i" aria-label={t.attrHelpAria}>
      ?
      <div className={`info-tip ${align === 'left' ? 'from-left' : ''}`}>
        <div className="info-block">
          <div className="info-title">{t.strTitle}</div>
          <div className="info-desc">{t.strHelp}</div>
        </div>
        <div className="info-block">
          <div className="info-title">{t.dexTitle}</div>
          <div className="info-desc">{t.dexHelp}</div>
        </div>
        <div className="info-block">
          <div className="info-title">{t.conTitle}</div>
          <div className="info-desc">{t.conHelp}</div>
        </div>
      </div>
    </span>
  );
}
