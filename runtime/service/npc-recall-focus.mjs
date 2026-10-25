import {npcRecallTopics} from '../core/npc-memory.mjs';

// Relevance only: an utterance can name a topic without proving any event happened.
// Exact whole sentences avoid carrying a topic across a new question or action.
function isFollowup(text){
 if(typeof text!=='string')return false;
 const plain=text.normalize('NFKC').trim().replace(/[ \t]+/gu,'').replace(/[。.!?！？]+$/u,'');
 return /^(?:(?:那)?(?:后来|现在|之后)(?:呢|怎么样)|还有呢|那这件事呢)$/u.test(plain);
}

export function npcRecallFocus(text,conversation){
 const current=npcRecallTopics(text),none={source:'none',topics:[],anchorEventSeq:null};
 if(current.length)return {query:text,focus:{source:'current-utterance',topics:current,anchorEventSeq:null}};
 if(isFollowup(text)){
  // The same eight confirmed turns sent to the model; no older hidden speech search.
  for(const turn of conversation.slice(-8).toReversed()){
   const topics=npcRecallTopics(turn.utterance);
   if(topics.length)return {query:turn.utterance,focus:{source:'confirmed-player-followup',topics,anchorEventSeq:turn.eventSeq}};
   if(!isFollowup(turn.utterance))break;
  }
 }
 return {query:text,focus:none};
}
