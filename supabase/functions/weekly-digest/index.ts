import { corsHeaders } from '@supabase/supabase-js/cors'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const now = new Date()
    // AEST = UTC+10
    const aestOffset = 10 * 60 * 60 * 1000
    const aestNow = new Date(now.getTime() + aestOffset)
    
    // Last week Mon-Sun
    const dayOfWeek = aestNow.getDay() // 0=Sun, 1=Mon
    const daysSinceLastMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const lastMon = new Date(aestNow)
    lastMon.setDate(aestNow.getDate() - daysSinceLastMon - 7)
    lastMon.setHours(0, 0, 0, 0)
    const lastSun = new Date(lastMon)
    lastSun.setDate(lastMon.getDate() + 6)
    lastSun.setHours(23, 59, 59, 999)

    // This week Mon-Sun
    const thisMon = new Date(aestNow)
    thisMon.setDate(aestNow.getDate() - daysSinceLastMon)
    thisMon.setHours(0, 0, 0, 0)
    const thisSun = new Date(thisMon)
    thisSun.setDate(thisMon.getDate() + 6)
    thisSun.setHours(23, 59, 59, 999)

    const lastMonISO = new Date(lastMon.getTime() - aestOffset).toISOString()
    const lastSunISO = new Date(lastSun.getTime() - aestOffset).toISOString()
    const thisMonISO = new Date(thisMon.getTime() - aestOffset).toISOString()
    const thisSunISO = new Date(thisSun.getTime() - aestOffset).toISOString()

    // Completed last week
    const { data: completedJobs } = await supabase
      .from('jobs')
      .select('id, price_ex_gst')
      .in('status', ['completed', 'complete'])
      .gte('clock_off_at', lastMonISO)
      .lte('clock_off_at', lastSunISO)

    const completedCount = completedJobs?.length || 0
    const revenue = (completedJobs || []).reduce((sum: number, j: any) => sum + (j.price_ex_gst || 0), 0)

    // In progress now
    const { count: inProgressCount } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'in_progress')

    // Outstanding invoices
    const { count: uninvoicedCount } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['completed', 'complete'])
      .or('invoice_status.eq.not_raised,invoice_status.is.null')

    // Upcoming this week
    const todayStr = aestNow.toISOString().slice(0, 10)
    const sunStr = thisSun.toISOString().slice(0, 10)
    const { count: upcomingCount } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .gte('scheduled_date', todayStr)
      .lte('scheduled_date', sunStr)
      .not('status', 'eq', 'cancelled')

    const dateRange = `${lastMon.getDate()}/${lastMon.getMonth() + 1} – ${lastSun.getDate()}/${lastSun.getMonth() + 1}`

    const message = `📊 Weekly Digest — ${dateRange}\n\n✅ Completed last week: ${completedCount} jobs ($${revenue.toFixed(0)})\n🔄 Currently in progress: ${inProgressCount || 0}\n🧾 Invoices to raise: ${uninvoicedCount || 0}\n📅 Upcoming this week: ${upcomingCount || 0}\n\n— Brightly Ops`

    // Send via send-job-sms
    await supabase.functions.invoke('send-job-sms', {
      body: { to: 'ADMIN', message },
    })

    return new Response(JSON.stringify({ success: true, message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
