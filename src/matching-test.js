import { generateDraw, validateDraw } from './matching.js';

export function testMatchmaking(people,options,{draws=100,budgetMs=1000,maxVisits=50000}={}) {
  const report={status:'passed',participants:people.length,requested:draws,checked:0,issues:[],
    rules:['Everyone gives and receives once','No self-matches','No repeat recipients from the previous two years',
      'Marked partners cannot draw each other',
      ...(options.noReciprocal===true?['Original restriction: no mutual pairs']:[]),
      ...(options.exclusions?.length?['Saved exclusions respected']:[])]};
  const deadline=performance.now()+budgetMs;
  for(let i=0;i<draws;i++) {
    let pairs;
    try { pairs=generateDraw(people,options,{maxVisits,deadline}); }
    catch(error) {
      const status={INVALID_ROSTER:'invalid',NO_VALID_DRAW:'impossible',SEARCH_LIMIT:'limited'}[error.code];
      if(!status)throw error;
      report.status=status==='impossible'&&report.checked?'failed':status;
      report.issues=[error.message];return report;
    }
    const issues=validateDraw(pairs,people,options);
    if(issues.length){report.status='failed';report.issues=issues;return report;}
    report.checked++;
  }
  return report;
}
