// Keep complete trajectories, removing samples only when interpolation remains
// within small distance, lateral, heading and speed error limits.
export const ghostTolerance = [0,.05,.035,.006,.2];
const precision = [1000,100,1000,10000,100];
export function compactGhost(frames) {
  if (!Array.isArray(frames) || !frames.length) return [];
  const points = frames.map((frame,index) => frame.slice(0,5).map((value,field) => index === 0 || index === frames.length-1 ? value : Math.round(value*precision[field])/precision[field]));
  const keep = new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;
  // Bounded chunks avoid quadratic work on long, noisy endurance recordings.
  for (let start=0;start<points.length-1;start+=128) {
    const end=Math.min(points.length-1,start+128),stack=[[start,end]];keep[start]=keep[end]=1;
    while(stack.length){
      const [aIndex,bIndex]=stack.pop(),a=points[aIndex],b=points[bIndex];
      let largest=1,split=-1;
      for(let i=aIndex+1;i<bIndex;i++){
        const point=points[i],fraction=b[0]===a[0]?0:(point[0]-a[0])/(b[0]-a[0]);
        for(let field=1;field<5;field++){
          const error=Math.abs(point[field]-(a[field]+(b[field]-a[field])*fraction))/ghostTolerance[field];
          if(error>largest){largest=error;split=i;}
        }
      }
      if(split>=0){keep[split]=1;stack.push([aIndex,split],[split,bIndex]);}
    }
  }
  return points.filter((_,index)=>keep[index]);
}
