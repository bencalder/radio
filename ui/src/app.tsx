import React, { useEffect, useRef, useState } from 'react';
import { useAppSelector, useAppDispatch } from './app/hooks';
import Urbit from '@urbit/http-api';
import { Radio } from './lib';
import { InitialSplash } from './components/InitialSplash';
import { ChatBox } from './components/ChatBox';
import { NavItem } from './components/NavItem';
import { PlayerColumn } from './components/PlayerColumn';
import { Navigation } from './components/Navigation';
import { ChatColumn } from './components/ChatColumn';
import {
  setTalkMsg,
  setSpinUrl,
  setSpinTime,
  setTunePatP,
  setRadioSub,
  setIsPublic,
  setViewers,
  selectTalkMsg,
  selectSpinUrl,
  selectSpinTime,
  selectTunePatP,
  selectRadioSub,
  selectIsPublic,
} from './features/station/stationSlice';
import {
  setUserInteracted,
  setPlayerReady,
  setPlayerInSync,
  setNavigationOpen,
  setHelpMenuOpen,
  setHelpMenuTop,
  setHelpMenuLeft,
  selectUserInteracted,
  selectNavigationOpen,
  selectPlayerInSync,
  selectPlayerReady,
  selectHelpMenuOpen,
  selectHelpMenuTop,
  selectHelpMenuLeft
} from './features/ui/uiSlice';

const api = new Urbit('', '', window.desk);
api.ship = window.ship;

const our = '~'+window.ship;
const watchParty = '~nodmyn-dosrux'
const tuneInitial = watchParty;

let radio : Radio;
radio = new Radio(our, api);

export function App() {

  const [update, setUpdate] = useState();

  const userInteracted = useAppSelector(selectUserInteracted);
  const playerReady = useAppSelector(selectPlayerReady);
  const playerInSync = useAppSelector(selectPlayerInSync);

  const spinUrl = useAppSelector(selectSpinUrl);
  const spinTime = useAppSelector(selectSpinTime);
  const tunePatP = useAppSelector(selectTunePatP);
  const radioSub = useAppSelector(selectRadioSub);
  
  const dispatch = useAppDispatch();

  const inputReference = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // autofocus input
    if (!inputReference) return;
    if (!inputReference.current) return;
    window.setTimeout(() => {
      // use a slight delay for better UX
      // @ts-ignore
      inputReference.current.focus();
    }, 250);

  }, [userInteracted]);

  useEffect(() => {
    setInterval(() => {
      // heartbeat to detect presence
      radio.ping();
    }, 1000 * 60 * 3)
  }, [])


  const initChats = [{'message': '','from': '','time': 0}];
  const [chats, setChats] = useState(initChats)
  const maxChats = 100;
  useEffect(() => {
    // maximum chats
    if(chats.length > maxChats) {
      setChats(chats.slice(1));
    }
  }, [chats])

  useEffect(() => {
    dispatch(setPlayerInSync(true));
    radio.seekToDelta(spinTime)
  }, [playerReady])

  useEffect(() => {
    if (!radio.player) return;
      radio.player.url = spinUrl;
  }, [spinUrl]);

  useEffect(() => {
    if (!radio.player) return;
    if (!playerReady) return;
    dispatch(setPlayerInSync(true));
    radio.seekToDelta(spinTime)
  }, [spinTime]);

  // initialize subscription
  useEffect(() => {
    if (!api || radioSub) return;
      api
        .subscribe({
            app: "tenna",
            path: "/frontend",
            event: handleSub,
            quit: () => console.log('radio quit'),
            err: (e) => console.log('radio err',e ),
        })
        .then((subscriptionId) => {
          dispatch(setRadioSub(subscriptionId));
          radio.tune(tuneInitial);
          });
  }, [api]);

  // unsub on window close or refresh
  useEffect(() => {
    window.addEventListener("beforeunload", unsubFunc);
    return () => {
      window.removeEventListener("beforeunload", unsubFunc);
    };
  }, [radioSub]);
  //
  const unsubFunc = () => {
    radio.tune(null);
    api.unsubscribe(radioSub);
    api.delete();
  };

  // manage SSE events
  function handleSub(update:any) {
    setUpdate(update);
  }
  useEffect(() => {
    if (!update) return;
    // wrap updates in this effect to get accurate usestate
    handleUpdate(update);
  }, [update]);
  function handleUpdate(update:any) {
      console.log("radio update", update);
      let mark = Object.keys(update)[0];
      //
      // handle updates from tower / radio station
      switch (mark) {
        case "spin":
          var updateSpin = update["spin"];

          dispatch(setSpinUrl(updateSpin.url));
          dispatch(setSpinTime(updateSpin.time));
          break;
        case "talk":
          // let synth = window.speechSynthesis;
          var updateTalk = update["talk"];
          var utterThis = new SpeechSynthesisUtterance(updateTalk);
          
          dispatch(setTalkMsg(updateTalk));
          
          if (!userInteracted) return;
          radio.synth.speak(utterThis);
          break;
        case "tune":
          let tune = update['tune'];
          dispatch(setTunePatP(tune));
          radio.tunedTo = tune;
          if (tune === null) {
            resetPage();
            dispatch(setUserInteracted(false));
            // radio.tune(our)
            // alert('whoops, you left the radio station')
          } else {
            radio.ping();
          }
          break;
        case "chat":
          let chat = update['chat'];
          setChat(chat);
          // setChats(prevChats => [...prevChats, `${chat.from}: ${chat.message}`])  ;
          break;
        case 'viewers':
          dispatch(setViewers(update['viewers']));
          break;
        case "public":
          dispatch(setIsPublic(update['public']))
          break;
        case "chatlog":
          setChats(initChats)
          let chatlog = update['chatlog']
          for(let i = 0; i < chatlog.length; i++) {
            setChat(chatlog[i])
          }
          break;
      }
  };

  function setChat(chat:any) {
    setChats(prevChats => [...prevChats, chat]);
  }

  function resetPage() {
    dispatch(setPlayerReady(false));
    setChats(initChats);
    dispatch(setTalkMsg(''));
    dispatch(setViewers([]));
    dispatch(setSpinUrl(''));
    dispatch(setNavigationOpen(false));
    dispatch(setHelpMenuOpen(false));
  }

  function handleProgress(progress: any) {
    // autoscrubbing

    var currentUnixTime = Date.now() / 1000;
    var delta = Math.ceil(currentUnixTime - spinTime);
    var duration = radio.player.getDuration();
    let diff = Math.abs((delta % duration) - progress.playedSeconds)

    if (our === radio.tunedTo) {
      // if(diff > 60) {
      //   console.log('host broadcasting new time')
      //   radio.setTime(spinUrl, progress.playedSeconds);
      // }
      if (diff > 3) {
        dispatch(setPlayerInSync(false));
      }
      return;
    }
    // we arent the host
    if (diff > 2) {
        // client scrub to host
        console.log('client scrubbing to host')
        radio.seekToDelta(spinTime);
        return;
    }
  }

  if (!userInteracted) {
    return <InitialSplash onClick={() => dispatch(setUserInteracted(true))}/>
  }
  
  function tuneTo(patp:string | null) {
    radio.tune(patp)
    radio.tunedTo = null;
    dispatch(setTunePatP(patp+' (LOADING)'));
    // setTunePatP(patp);i
    resetPage();
  }

  function radioSeekToDelta(spinTime: number) {
    radio.seekToDelta(spinTime);
  }

  return (
    <div className="mx-2 md:mx-20 text-xs font-mono">
      <div className="flex flex-row">
        <div className="inline-block mr-4 w-2/3">
          <Navigation
            our={our}
            tuneTo={tuneTo}
          />
          <PlayerColumn 
            our={our}
            handleProgress={handleProgress}
            playerRef={radio.playerRef}
            radioSeekToDelta={radio.seekToDelta}
            radioResyncAll={radio.resyncAll}
          />
        </div>
        <ChatColumn
          our={our}
          radio={radio}
          tuneTo={tuneTo}
          inputReference={inputReference}
          chats={chats}
        />
      </div>
    </div>
  );
}
