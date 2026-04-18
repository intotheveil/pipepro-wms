import { getSupabase } from './supabase';

export async function getNotifications(supabase, projectId) {
  const today = new Date();
  const in10Days = new Date(today);
  in10Days.setDate(in10Days.getDate() + 10);
  const todayStr = today.toISOString().split('T')[0];
  const in10Str = in10Days.toISOString().split('T')[0];

  const notifications = [];

  // Welder qualifications expiring within 10 days
  const { data: welders } = await supabase.from('welders')
    .select('name, stamp, qualification_exp')
    .eq('project_id', projectId)
    .lte('qualification_exp', in10Str)
    .gte('qualification_exp', todayStr);
  welders?.forEach(w => notifications.push({
    type: 'warning',
    category: 'welder',
    message: `Welder ${w.stamp} (${w.name}) qualification expires ${w.qualification_exp}`,
    date: w.qualification_exp,
  }));

  // Expired welders
  const { data: expiredWelders } = await supabase.from('welders')
    .select('name, stamp, qualification_exp')
    .eq('project_id', projectId)
    .lt('qualification_exp', todayStr);
  expiredWelders?.forEach(w => notifications.push({
    type: 'error',
    category: 'welder',
    message: `Welder ${w.stamp} (${w.name}) qualification EXPIRED on ${w.qualification_exp}`,
    date: w.qualification_exp,
  }));

  // Personnel qualifications expiring
  const { data: personnel } = await supabase.from('personnel_qualifications')
    .select('full_name, cert_type, expiry_date')
    .eq('project_id', projectId)
    .lte('expiry_date', in10Str)
    .gte('expiry_date', todayStr);
  personnel?.forEach(p => notifications.push({
    type: 'warning',
    category: 'personnel',
    message: `${p.full_name} \u2014 ${p.cert_type} expires ${p.expiry_date}`,
    date: p.expiry_date,
  }));

  // Expired personnel
  const { data: expiredPersonnel } = await supabase.from('personnel_qualifications')
    .select('full_name, cert_type, expiry_date')
    .eq('project_id', projectId)
    .lt('expiry_date', todayStr);
  expiredPersonnel?.forEach(p => notifications.push({
    type: 'error',
    category: 'personnel',
    message: `${p.full_name} \u2014 ${p.cert_type} EXPIRED on ${p.expiry_date}`,
    date: p.expiry_date,
  }));

  // Equipment calibrations expiring
  const { data: equipment } = await supabase.from('equipment_calibration')
    .select('equipment_name, equipment_id, expiry_date')
    .eq('project_id', projectId)
    .lte('expiry_date', in10Str)
    .gte('expiry_date', todayStr);
  equipment?.forEach(e => notifications.push({
    type: 'warning',
    category: 'equipment',
    message: `${e.equipment_name} (${e.equipment_id || 'N/A'}) calibration expires ${e.expiry_date}`,
    date: e.expiry_date,
  }));

  // Expired equipment
  const { data: expiredEquipment } = await supabase.from('equipment_calibration')
    .select('equipment_name, equipment_id, expiry_date')
    .eq('project_id', projectId)
    .lt('expiry_date', todayStr);
  expiredEquipment?.forEach(e => notifications.push({
    type: 'error',
    category: 'equipment',
    message: `${e.equipment_name} (${e.equipment_id || 'N/A'}) calibration EXPIRED on ${e.expiry_date}`,
    date: e.expiry_date,
  }));

  return notifications.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}
