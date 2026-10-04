import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Clock, Smile, Heart, PawPrint, Utensils, Trophy, Car, Lightbulb, Hash } from 'lucide-react';

const EMOJI_CATEGORIES = [
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    icon: Smile,
    emojis: [
      { char: '😀', keywords: ['grinning', 'smile', 'happy'] },
      { char: '😃', keywords: ['smiley', 'happy', 'joy'] },
      { char: '😄', keywords: ['smile', 'happy', 'laugh'] },
      { char: '😁', keywords: ['beam', 'grin', 'happy'] },
      { char: '😆', keywords: ['laugh', 'lol', 'haha'] },
      { char: '😅', keywords: ['sweat', 'smile', 'relief'] },
      { char: '🤣', keywords: ['rofl', 'laughing', 'lol'] },
      { char: '😂', keywords: ['joy', 'tears', 'crying', 'laugh'] },
      { char: '🙂', keywords: ['slightly', 'smile'] },
      { char: '🙃', keywords: ['upside', 'down', 'sarcasm'] },
      { char: '😉', keywords: ['wink', 'flirt'] },
      { char: '😊', keywords: ['blush', 'proud', 'happy'] },
      { char: '😇', keywords: ['angel', 'innocent', 'halo'] },
      { char: '🥰', keywords: ['love', 'hearts', 'adore'] },
      { char: '😍', keywords: ['heart', 'eyes', 'love'] },
      { char: '🤩', keywords: ['star', 'struck', 'excited'] },
      { char: '😘', keywords: ['kiss', 'love'] },
      { char: '😗', keywords: ['kissing'] },
      { char: '😚', keywords: ['kiss', 'closed', 'eyes'] },
      { char: '😙', keywords: ['kiss', 'smiling'] },
      { char: '😋', keywords: ['yum', 'delicious', 'tasty'] },
      { char: '😛', keywords: ['tongue', 'playful'] },
      { char: '😜', keywords: ['wink', 'tongue', 'crazy'] },
      { char: '🤪', keywords: ['zany', 'wild', 'crazy'] },
      { char: '😝', keywords: ['squinting', 'tongue'] },
      { char: '🤑', keywords: ['money', 'rich', 'dollar'] },
      { char: '🤗', keywords: ['hug', 'open', 'arms'] },
      { char: '🤭', keywords: ['giggle', 'hand', 'mouth'] },
      { char: '🤫', keywords: ['shh', 'quiet', 'secret'] },
      { char: '🤔', keywords: ['think', 'ponder', 'wonder'] },
      { char: '🤐', keywords: ['zipper', 'silent', 'shutup'] },
      { char: '🤨', keywords: ['skeptical', 'eyebrow'] },
      { char: '😐', keywords: ['neutral', 'meh'] },
      { char: '😑', keywords: ['expressionless'] },
      { char: '😶', keywords: ['mute', 'no', 'mouth'] },
      { char: '😏', keywords: ['smirk', 'flirt'] },
      { char: '😒', keywords: ['unamused', 'annoyed'] },
      { char: '🙄', keywords: ['eye', 'roll', 'annoyed'] },
      { char: '😬', keywords: ['grimace', 'awkward'] },
      { char: '🤥', keywords: ['liar', 'pinocchio'] },
      { char: '😌', keywords: ['relieved', 'calm'] },
      { char: '😔', keywords: ['pensive', 'sad'] },
      { char: '😪', keywords: ['sleepy', 'tired'] },
      { char: '🤤', keywords: ['drool', 'craving'] },
      { char: '😴', keywords: ['sleeping', 'zzz'] },
      { char: '😷', keywords: ['mask', 'sick', 'covid'] },
      { char: '🤒', keywords: ['thermometer', 'sick', 'fever'] },
      { char: '🤕', keywords: ['bandage', 'hurt', 'injury'] },
      { char: '🤢', keywords: ['nauseated', 'gross'] },
      { char: '🤮', keywords: ['vomit', 'barf', 'sick'] },
      { char: '🤧', keywords: ['sneeze', 'tissue', 'cold'] },
      { char: '🥵', keywords: ['hot', 'sweat', 'fever'] },
      { char: '🥶', keywords: ['cold', 'freeze', 'ice'] },
      { char: '🥴', keywords: ['woozy', 'drunk', 'dizzy'] },
      { char: '😵', keywords: ['dizzy', 'knocked', 'out'] },
      { char: '🤯', keywords: ['mind', 'blown', 'exploding', 'head'] },
      { char: '🤠', keywords: ['cowboy', 'hat'] },
      { char: '🥳', keywords: ['party', 'celebrate', 'horn'] },
      { char: '🥸', keywords: ['disguise', 'glasses'] },
      { char: '😎', keywords: ['cool', 'sunglasses'] },
      { char: '🤓', keywords: ['nerd', 'geek'] },
      { char: '🧐', keywords: ['monocle', 'detective'] },
      { char: '😕', keywords: ['confused', 'puzzled'] },
      { char: '😟', keywords: ['worried', 'nervous'] },
      { char: '🙁', keywords: ['frown', 'sad'] },
      { char: '😮', keywords: ['open', 'mouth', 'surprised'] },
      { char: '😯', keywords: ['hushed', 'speechless'] },
      { char: '😲', keywords: ['astonished', 'shocked'] },
      { char: '😳', keywords: ['flushed', 'embarrassed'] },
      { char: '🥺', keywords: ['pleading', 'puppy', 'eyes'] },
      { char: '😦', keywords: ['frowning', 'open'] },
      { char: '😧', keywords: ['anguished', 'scared'] },
      { char: '😨', keywords: ['fearful', 'afraid'] },
      { char: '😰', keywords: ['anxious', 'sweat'] },
      { char: '😥', keywords: ['sad', 'relieved'] },
      { char: '😢', keywords: ['cry', 'tear', 'sad'] },
      { char: '😭', keywords: ['sob', 'crying', 'loud'] },
      { char: '😱', keywords: ['scream', 'fear', 'scared'] },
      { char: '😖', keywords: ['confounded', 'frustrated'] },
      { char: '😣', keywords: ['persevering', 'struggle'] },
      { char: '😞', keywords: ['disappointed', 'sad'] },
      { char: '😓', keywords: ['downcast', 'sweat'] },
      { char: '😩', keywords: ['weary', 'tired'] },
      { char: '😫', keywords: ['tired', 'frustrated'] },
      { char: '🥱', keywords: ['yawn', 'sleepy', 'bored'] },
      { char: '😤', keywords: ['triumph', 'proud', 'fuming'] },
      { char: '😡', keywords: ['rage', 'angry', 'mad'] },
      { char: '😠', keywords: ['angry', 'grumpy'] },
      { char: '🤬', keywords: ['cursing', 'swearing', 'mad'] },
      { char: '💀', keywords: ['skull', 'dead', 'skeleton', 'laugh'] },
      { char: '☠️', keywords: ['crossbones', 'danger', 'pirate'] },
      { char: '💩', keywords: ['poop', 'crap'] },
      { char: '🤡', keywords: ['clown', 'fool'] },
      { char: '👻', keywords: ['ghost', 'spooky', 'halloween'] },
      { char: '👽', keywords: ['alien', 'ufo'] },
      { char: '🤖', keywords: ['robot', 'bot'] }
    ]
  },
  {
    id: 'gestures',
    name: 'Hearts & Gestures',
    icon: Heart,
    emojis: [
      { char: '❤️', keywords: ['heart', 'love', 'red'] },
      { char: '🧡', keywords: ['orange', 'heart'] },
      { char: '💛', keywords: ['yellow', 'heart'] },
      { char: '💚', keywords: ['green', 'heart'] },
      { char: '💙', keywords: ['blue', 'heart'] },
      { char: '💜', keywords: ['purple', 'heart'] },
      { char: '🖤', keywords: ['black', 'heart'] },
      { char: '🤍', keywords: ['white', 'heart'] },
      { char: '🤎', keywords: ['brown', 'heart'] },
      { char: '💔', keywords: ['broken', 'heart', 'heartbreak'] },
      { char: '❣️', keywords: ['exclamation', 'heart'] },
      { char: '💕', keywords: ['two', 'hearts', 'love'] },
      { char: '💞', keywords: ['revolving', 'hearts'] },
      { char: '💓', keywords: ['beating', 'heart'] },
      { char: '💗', keywords: ['growing', 'heart'] },
      { char: '💖', keywords: ['sparkle', 'heart'] },
      { char: '💘', keywords: ['cupid', 'arrow', 'heart'] },
      { char: '💝', keywords: ['ribbon', 'gift', 'heart'] },
      { char: '💟', keywords: ['heart', 'decoration'] },
      { char: '👍', keywords: ['thumbs', 'up', 'approve', 'like', 'good', 'yes'] },
      { char: '👎', keywords: ['thumbs', 'down', 'dislike', 'bad', 'no'] },
      { char: '👏', keywords: ['clap', 'applause', 'bravo'] },
      { char: '🙌', keywords: ['hooray', 'celebrate', 'praise'] },
      { char: '🫶', keywords: ['heart', 'hands', 'love'] },
      { char: '👐', keywords: ['open', 'hands'] },
      { char: '🤲', keywords: ['palms', 'up', 'prayer'] },
      { char: '🤝', keywords: ['handshake', 'deal', 'agreement'] },
      { char: '🙏', keywords: ['pray', 'please', 'thanks', 'namaste'] },
      { char: '✍️', keywords: ['writing', 'hand'] },
      { char: '💅', keywords: ['nail', 'polish', 'sass'] },
      { char: '🤳', keywords: ['selfie', 'phone'] },
      { char: '💪', keywords: ['muscle', 'strong', 'flex', 'power'] },
      { char: '👈', keywords: ['point', 'left'] },
      { char: '👉', keywords: ['point', 'right'] },
      { char: '👆', keywords: ['point', 'up'] },
      { char: '👇', keywords: ['point', 'down'] },
      { char: '☝️', keywords: ['index', 'up', 'one'] },
      { char: '✌️', keywords: ['peace', 'victory', 'two'] },
      { char: '🤞', keywords: ['fingers', 'crossed', 'luck'] },
      { char: '🫰', keywords: ['finger', 'heart', 'kpop', 'money'] },
      { char: '🤟', keywords: ['love', 'you', 'gesture'] },
      { char: '🤘', keywords: ['rock', 'on', 'horns'] },
      { char: '🤙', keywords: ['call', 'me', 'shaka'] },
      { char: '👌', keywords: ['ok', 'perfect', 'fine'] },
      { char: '🤌', keywords: ['pinched', 'fingers', 'italian'] },
      { char: '🤏', keywords: ['pinching', 'small', 'little'] },
      { char: '🖐️', keywords: ['hand', 'splayed', 'five'] },
      { char: '✋', keywords: ['raised', 'hand', 'stop', 'highfive'] },
      { char: '🖖', keywords: ['vulcan', 'salute', 'spock'] },
      { char: '👋', keywords: ['wave', 'hello', 'bye', 'hi'] },
      { char: '✊', keywords: ['fist', 'power'] },
      { char: '👊', keywords: ['punch', 'fistbump'] }
    ]
  },
  {
    id: 'animals',
    name: 'Animals & Nature',
    icon: PawPrint,
    emojis: [
      { char: '🐶', keywords: ['dog', 'puppy', 'pet'] },
      { char: '🐱', keywords: ['cat', 'kitten', 'pet'] },
      { char: '🐭', keywords: ['mouse', 'rodent'] },
      { char: '🐹', keywords: ['hamster', 'pet'] },
      { char: '🐰', keywords: ['rabbit', 'bunny'] },
      { char: '🦊', keywords: ['fox'] },
      { char: '🐻', keywords: ['bear'] },
      { char: '🐼', keywords: ['panda'] },
      { char: '🐨', keywords: ['koala'] },
      { char: '🐯', keywords: ['tiger'] },
      { char: '🦁', keywords: ['lion', 'king'] },
      { char: '🐮', keywords: ['cow'] },
      { char: '🐷', keywords: ['pig'] },
      { char: '🐸', keywords: ['frog'] },
      { char: '🐵', keywords: ['monkey'] },
      { char: '🐔', keywords: ['chicken'] },
      { char: '🐧', keywords: ['penguin'] },
      { char: '🐦', keywords: ['bird'] },
      { char: '🐤', keywords: ['baby', 'chick'] },
      { char: '🦆', keywords: ['duck'] },
      { char: '🦅', keywords: ['eagle'] },
      { char: '🦉', keywords: ['owl'] },
      { char: '🦇', keywords: ['bat'] },
      { char: '🐺', keywords: ['wolf'] },
      { char: '🐗', keywords: ['boar'] },
      { char: '🐴', keywords: ['horse'] },
      { char: '🦄', keywords: ['unicorn', 'magic'] },
      { char: '🐝', keywords: ['bee', 'honey'] },
      { char: '🐛', keywords: ['caterpillar', 'bug'] },
      { char: '🦋', keywords: ['butterfly', 'beauty'] },
      { char: '🐌', keywords: ['snail'] },
      { char: '🐞', keywords: ['ladybug'] },
      { char: '🐢', keywords: ['turtle', 'slow'] },
      { char: '🐍', keywords: ['snake'] },
      { char: '🐙', keywords: ['octopus'] },
      { char: '🐬', keywords: ['dolphin'] },
      { char: '🐳', keywords: ['whale'] },
      { char: '🦈', keywords: ['shark'] },
      { char: '🐊', keywords: ['crocodile'] },
      { char: '🐘', keywords: ['elephant'] },
      { char: '🌸', keywords: ['cherry', 'blossom', 'flower'] },
      { char: '🌹', keywords: ['rose', 'flower', 'romance'] },
      { char: '🌺', keywords: ['hibiscus', 'flower'] },
      { char: '🌻', keywords: ['sunflower'] },
      { char: '🌼', keywords: ['blossom', 'flower'] },
      { char: '🌷', keywords: ['tulip', 'flower'] },
      { char: '🌱', keywords: ['seedling', 'plant'] },
      { char: '🌲', keywords: ['evergreen', 'tree', 'nature'] },
      { char: '🌳', keywords: ['deciduous', 'tree'] },
      { char: '🌴', keywords: ['palm', 'tree', 'beach'] },
      { char: '🌵', keywords: ['cactus', 'desert'] },
      { char: '🍀', keywords: ['four', 'leaf', 'clover', 'luck'] }
    ]
  },
  {
    id: 'food',
    name: 'Food & Drink',
    icon: Utensils,
    emojis: [
      { char: '🍏', keywords: ['green', 'apple'] },
      { char: '🍎', keywords: ['red', 'apple'] },
      { char: '🍐', keywords: ['pear'] },
      { char: '🍊', keywords: ['orange', 'citrus'] },
      { char: '🍋', keywords: ['lemon'] },
      { char: '🍌', keywords: ['banana'] },
      { char: '🍉', keywords: ['watermelon'] },
      { char: '🍇', keywords: ['grapes'] },
      { char: '🍓', keywords: ['strawberry'] },
      { char: '🫐', keywords: ['blueberries'] },
      { char: '🍒', keywords: ['cherries'] },
      { char: '🍑', keywords: ['peach'] },
      { char: '🥭', keywords: ['mango'] },
      { char: '🍍', keywords: ['pineapple'] },
      { char: '🥥', keywords: ['coconut'] },
      { char: '🥝', keywords: ['kiwi'] },
      { char: '🍅', keywords: ['tomato'] },
      { char: '🥑', keywords: ['avocado'] },
      { char: '🥦', keywords: ['broccoli'] },
      { char: '🌽', keywords: ['corn'] },
      { char: '🥕', keywords: ['carrot'] },
      { char: '🥐', keywords: ['croissant', 'bakery'] },
      { char: '🍞', keywords: ['bread'] },
      { char: '🥖', keywords: ['baguette'] },
      { char: '🥨', keywords: ['pretzel'] },
      { char: '🧀', keywords: ['cheese'] },
      { char: '🥞', keywords: ['pancakes', 'breakfast'] },
      { char: '🧇', keywords: ['waffle'] },
      { char: '🥓', keywords: ['bacon'] },
      { char: '🍔', keywords: ['burger', 'hamburger', 'fastfood'] },
      { char: '🍟', keywords: ['fries', 'french', 'chips'] },
      { char: '🍕', keywords: ['pizza'] },
      { char: '🌭', keywords: ['hotdog'] },
      { char: '🥪', keywords: ['sandwich'] },
      { char: '🌮', keywords: ['taco', 'mexican'] },
      { char: '🌯', keywords: ['burrito'] },
      { char: '🥗', keywords: ['salad', 'healthy'] },
      { char: '🍿', keywords: ['popcorn', 'movie'] },
      { char: '🍣', keywords: ['sushi', 'japanese'] },
      { char: '🍦', keywords: ['ice', 'cream'] },
      { char: '🍩', keywords: ['donut', 'doughnut'] },
      { char: '🍪', keywords: ['cookie', 'sweet'] },
      { char: '🎂', keywords: ['birthday', 'cake'] },
      { char: '🍰', keywords: ['shortcake', 'cake', 'dessert'] },
      { char: '🍫', keywords: ['chocolate', 'candy'] },
      { char: '🍬', keywords: ['candy', 'sweet'] },
      { char: '🍭', keywords: ['lollipop'] },
      { char: '☕', keywords: ['coffee', 'tea', 'cafe'] },
      { char: '🍵', keywords: ['tea', 'green'] },
      { char: '🧃', keywords: ['juice', 'box'] },
      { char: '🧋', keywords: ['boba', 'bubble', 'tea'] },
      { char: '🍺', keywords: ['beer', 'drink', 'bar'] },
      { char: '🍻', keywords: ['cheers', 'beers'] },
      { char: '🥂', keywords: ['clinking', 'glasses', 'toast', 'champagne'] },
      { char: '🍷', keywords: ['wine'] }
    ]
  },
  {
    id: 'activities',
    name: 'Activities & Sports',
    icon: Trophy,
    emojis: [
      { char: '⚽', keywords: ['soccer', 'football', 'ball'] },
      { char: '🏀', keywords: ['basketball'] },
      { char: '🏈', keywords: ['american', 'football'] },
      { char: '⚾', keywords: ['baseball'] },
      { char: '🥎', keywords: ['softball'] },
      { char: '🎾', keywords: ['tennis'] },
      { char: '🏐', keywords: ['volleyball'] },
      { char: '🏉', keywords: ['rugby'] },
      { char: '🎱', keywords: ['8ball', 'billiards', 'pool'] },
      { char: '🏓', keywords: ['ping', 'pong', 'table', 'tennis'] },
      { char: '🏸', keywords: ['badminton'] },
      { char: '🥊', keywords: ['boxing', 'glove'] },
      { char: '🥋', keywords: ['martial', 'arts', 'karate'] },
      { char: '🛹', keywords: ['skateboard'] },
      { char: '🏋️', keywords: ['weightlifting', 'gym', 'workout'] },
      { char: '🚴', keywords: ['biking', 'bicycle'] },
      { char: '🏆', keywords: ['trophy', 'winner', 'cup', 'first'] },
      { char: '🥇', keywords: ['gold', 'medal', 'first'] },
      { char: '🥈', keywords: ['silver', 'medal'] },
      { char: '🥉', keywords: ['bronze', 'medal'] },
      { char: '🎖️', keywords: ['military', 'medal'] },
      { char: '🎫', keywords: ['ticket', 'admission'] },
      { char: '🎟️', keywords: ['tickets'] },
      { char: '🎪', keywords: ['circus', 'tent'] },
      { char: '🎨', keywords: ['art', 'palette', 'paint'] },
      { char: '🎬', keywords: ['clapper', 'movie', 'film'] },
      { char: '🎤', keywords: ['microphone', 'sing', 'karaoke'] },
      { char: '🎧', keywords: ['headphones', 'music'] },
      { char: '🎼', keywords: ['musical', 'score'] },
      { char: '🎹', keywords: ['piano', 'keys'] },
      { char: '🥁', keywords: ['drums'] },
      { char: '🎸', keywords: ['guitar', 'rock'] },
      { char: '🎮', keywords: ['video', 'game', 'controller', 'play'] },
      { char: '🎯', keywords: ['dart', 'target', 'bullseye'] },
      { char: '🎲', keywords: ['dice', 'game', 'chance'] },
      { char: '🎳', keywords: ['bowling'] }
    ]
  },
  {
    id: 'travel',
    name: 'Travel & Places',
    icon: Car,
    emojis: [
      { char: '🚗', keywords: ['car', 'automobile'] },
      { char: '🚕', keywords: ['taxi', 'cab'] },
      { char: '🚙', keywords: ['suv', 'car'] },
      { char: '🚌', keywords: ['bus'] },
      { char: '🏎️', keywords: ['racing', 'car'] },
      { char: '🚓', keywords: ['police', 'car'] },
      { char: '🚑', keywords: ['ambulance'] },
      { char: '🚒', keywords: ['fire', 'engine', 'truck'] },
      { char: '🚚', keywords: ['truck', 'delivery'] },
      { char: '🚲', keywords: ['bicycle', 'bike'] },
      { char: '🛵', keywords: ['scooter', 'motor'] },
      { char: '🏍️', keywords: ['motorcycle'] },
      { char: '🚨', keywords: ['police', 'siren', 'emergency', 'alert'] },
      { char: '🚄', keywords: ['high', 'speed', 'train', 'shinkansen'] },
      { char: '🚆', keywords: ['train'] },
      { char: '🚇', keywords: ['metro', 'subway'] },
      { char: '✈️', keywords: ['airplane', 'flight', 'travel'] },
      { char: '🛫', keywords: ['departure', 'takeoff'] },
      { char: '🛬', keywords: ['arrival', 'landing'] },
      { char: '🚀', keywords: ['rocket', 'space', 'launch', 'moon'] },
      { char: '🛸', keywords: ['ufo', 'flying', 'saucer'] },
      { char: '🚁', keywords: ['helicopter'] },
      { char: '⛵', keywords: ['sailboat', 'boat'] },
      { char: '🚤', keywords: ['speedboat'] },
      { char: '🛳️', keywords: ['passenger', 'ship', 'cruise'] },
      { char: '🚢', keywords: ['ship'] },
      { char: '⚓', keywords: ['anchor'] },
      { char: '🗼', keywords: ['tokyo', 'tower'] },
      { char: '🗽', keywords: ['statue', 'liberty'] },
      { char: '🏰', keywords: ['castle'] },
      { char: '🏠', keywords: ['house', 'home'] },
      { char: '🏢', keywords: ['office', 'building'] },
      { char: '🌅', keywords: ['sunrise'] },
      { char: '🌄', keywords: ['sunrise', 'mountains'] },
      { char: '🌆', keywords: ['cityscape', 'dusk'] },
      { char: '🌇', keywords: ['sunset'] },
      { char: '🌉', keywords: ['bridge', 'night'] },
      { char: '🌋', keywords: ['volcano'] },
      { char: '🗻', keywords: ['mount', 'fuji'] }
    ]
  },
  {
    id: 'objects',
    name: 'Objects',
    icon: Lightbulb,
    emojis: [
      { char: '💡', keywords: ['light', 'bulb', 'idea'] },
      { char: '🔦', keywords: ['flashlight', 'torch'] },
      { char: '🕯️', keywords: ['candle'] },
      { char: '📱', keywords: ['mobile', 'phone', 'cell'] },
      { char: '💻', keywords: ['laptop', 'computer', 'mac'] },
      { char: '⌨️', keywords: ['keyboard'] },
      { char: '🖥️', keywords: ['desktop', 'computer'] },
      { char: '📷', keywords: ['camera', 'photo'] },
      { char: '📸', keywords: ['camera', 'flash'] },
      { char: '📹', keywords: ['video', 'camera'] },
      { char: '📺', keywords: ['television', 'tv'] },
      { char: '⏰', keywords: ['alarm', 'clock', 'time'] },
      { char: '⏱️', keywords: ['stopwatch'] },
      { char: '⌛', keywords: ['hourglass', 'time'] },
      { char: '⏳', keywords: ['sand', 'hourglass'] },
      { char: '🔋', keywords: ['battery'] },
      { char: '🔌', keywords: ['plug', 'power'] },
      { char: '💸', keywords: ['money', 'wings', 'flying'] },
      { char: '💵', keywords: ['dollar', 'banknote', 'cash'] },
      { char: '💰', keywords: ['money', 'bag', 'rich'] },
      { char: '💳', keywords: ['credit', 'card'] },
      { char: '💎', keywords: ['gem', 'diamond', 'jewel'] },
      { char: '🔧', keywords: ['wrench', 'tool'] },
      { char: '🔨', keywords: ['hammer', 'tool'] },
      { char: '🛠️', keywords: ['tools', 'hammer', 'wrench'] },
      { char: '🔑', keywords: ['key', 'lock'] },
      { char: '🔒', keywords: ['locked', 'secure'] },
      { char: '🔓', keywords: ['unlocked', 'open'] },
      { char: '🔔', keywords: ['bell', 'notification', 'ring'] },
      { char: '🔕', keywords: ['bell', 'slash', 'mute'] },
      { char: '📦', keywords: ['package', 'box', 'delivery'] },
      { char: '✉️', keywords: ['envelope', 'mail', 'email'] },
      { char: '📝', keywords: ['memo', 'note', 'pencil'] },
      { char: '📁', keywords: ['folder'] },
      { char: '📅', keywords: ['calendar', 'date'] },
      { char: '📌', keywords: ['pushpin', 'pin'] },
      { char: '📍', keywords: ['round', 'pushpin', 'location'] },
      { char: '✂️', keywords: ['scissors', 'cut'] },
      { char: '🔍', keywords: ['search', 'magnifier', 'find'] },
      { char: '🔎', keywords: ['search', 'magnifying', 'glass'] },
      { char: '🎁', keywords: ['gift', 'present', 'birthday'] },
      { char: '🎈', keywords: ['balloon', 'party'] },
      { char: '🎉', keywords: ['party', 'popper', 'celebrate', 'tada'] },
      { char: '🎊', keywords: ['confetti', 'ball'] }
    ]
  },
  {
    id: 'symbols',
    name: 'Symbols',
    icon: Hash,
    emojis: [
      { char: '🔥', keywords: ['fire', 'flame', 'lit', 'hot'] },
      { char: '✨', keywords: ['sparkles', 'stars', 'magic', 'shine'] },
      { char: '🌟', keywords: ['glowing', 'star'] },
      { char: '⭐', keywords: ['star'] },
      { char: '💥', keywords: ['collision', 'boom', 'bang'] },
      { char: '💯', keywords: ['hundred', 'points', 'perfect', '100'] },
      { char: '⚠️', keywords: ['warning', 'caution', 'alert'] },
      { char: '⛔', keywords: ['no', 'entry', 'stop'] },
      { char: '🚫', keywords: ['prohibited', 'forbidden', 'no'] },
      { char: '❓', keywords: ['question', 'mark'] },
      { char: '❗', keywords: ['exclamation', 'mark', 'important'] },
      { char: '💬', keywords: ['speech', 'bubble', 'chat', 'message'] },
      { char: '💭', keywords: ['thought', 'bubble'] },
      { char: '💤', keywords: ['zzz', 'sleep'] },
      { char: '✅', keywords: ['check', 'mark', 'yes', 'done', 'approved'] },
      { char: '✔️', keywords: ['check', 'tick'] },
      { char: '❌', keywords: ['cross', 'mark', 'no', 'wrong'] },
      { char: '🟢', keywords: ['green', 'circle', 'online'] },
      { char: '🔴', keywords: ['red', 'circle'] },
      { char: '🟡', keywords: ['yellow', 'circle'] },
      { char: '🔵', keywords: ['blue', 'circle'] },
      { char: '🟣', keywords: ['purple', 'circle'] },
      { char: '⚪', keywords: ['white', 'circle'] },
      { char: '🏁', keywords: ['checkered', 'flag', 'racing'] },
      { char: '🚩', keywords: ['triangular', 'flag', 'red', 'flag'] }
    ]
  }
];

const DEFAULT_RECENTS = ['😀', '😂', '😍', '🥰', '❤️', '🔥', '👍', '🎉', '✨', '👏', '🙏', '😊', '🙌', '💯'];
const RECENTS_KEY = 'aquachat_recent_emojis';

export default function EmojiPicker({ open, onClose, onSelectEmoji, isMobile }) {
  const [activeCategory, setActiveCategory] = useState('smileys');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentEmojis, setRecentEmojis] = useState(() => {
    try {
      const stored = localStorage.getItem(RECENTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_RECENTS;
  });

  const pickerRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setSearchQuery('');
      const timer = setTimeout(() => {
        if (!isMobile) searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, isMobile]);

  const handleEmojiClick = (emojiChar) => {
    onSelectEmoji(emojiChar);

    setRecentEmojis((prev) => {
      const filtered = prev.filter((char) => char !== emojiChar);
      const next = [emojiChar, ...filtered].slice(0, 24);
      try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;

    const results = [];
    const seen = new Set();

    for (const cat of EMOJI_CATEGORIES) {
      for (const item of cat.emojis) {
        if (seen.has(item.char)) continue;
        const matchesKeyword = item.keywords.some((kw) => kw.includes(q));
        const matchesName = item.char === q;
        if (matchesKeyword || matchesName) {
          seen.add(item.char);
          results.push(item.char);
        }
      }
    }
    return results;
  }, [searchQuery]);

  if (!open) return null;

  return (
    <div
      ref={pickerRef}
      role="dialog"
      aria-label="Emoji Picker"
      className={`emoji-picker-container absolute z-40 flex flex-col rounded-3xl border border-aqua-100/80 bg-white/95 shadow-soft-xl backdrop-blur-md transition-all duration-200 animate-pop ${
        isMobile
          ? 'bottom-full mb-2 left-2 right-2 max-w-[calc(100vw-1rem)] mx-auto h-80'
          : 'bottom-full mb-3 left-0 w-84 sm:w-96 h-92'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-aqua-100/60 p-2.5 sm:p-3">
        <div className="relative flex flex-1 items-center">
          <Search size={16} className="absolute left-3 text-slate-400 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emojis..."
            className="w-full rounded-2xl border border-aqua-100/70 bg-aqua-50/50 py-1.5 pl-9 pr-8 text-sm text-slate-800 placeholder-slate-400 outline-none transition focus:border-cyan-400 focus:bg-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-1.5 text-slate-400 hover:bg-aqua-50 hover:text-slate-600 transition"
          aria-label="Close emoji picker"
        >
          <X size={18} />
        </button>
      </div>

      {!searchQuery && (
        <div className="flex items-center gap-1 border-b border-aqua-50 px-2 py-1.5 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveCategory('recents')}
            title="Recent"
            className={`rounded-xl p-2 transition ${
              activeCategory === 'recents'
                ? 'bg-gradient-to-r from-cyan-500 to-aqua-400 text-white shadow-sm'
                : 'text-slate-500 hover:bg-aqua-50 hover:text-cyan-700'
            }`}
          >
            <Clock size={16} />
          </button>
          {EMOJI_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                title={cat.name}
                className={`rounded-xl p-2 transition ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500 to-aqua-400 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-aqua-50 hover:text-cyan-700'
                }`}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 scrollbar-thin">
        {searchResults !== null ? (
          <div>
            <p className="mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              Search Results ({searchResults.length})
            </p>
            {searchResults.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                No emojis found for "{searchQuery}"
              </div>
            ) : (
              <div className="grid grid-cols-7 sm:grid-cols-8 gap-1">
                {searchResults.map((emojiChar, idx) => (
                  <button
                    key={`${emojiChar}-${idx}`}
                    type="button"
                    onClick={() => handleEmojiClick(emojiChar)}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl text-2xl transition duration-150 hover:bg-aqua-50 hover:scale-120 active:scale-95 select-none"
                  >
                    {emojiChar}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : activeCategory === 'recents' ? (
          <div>
            <p className="mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              Recently Used
            </p>
            <div className="grid grid-cols-7 sm:grid-cols-8 gap-1">
              {recentEmojis.map((emojiChar, idx) => (
                <button
                  key={`${emojiChar}-${idx}`}
                  type="button"
                  onClick={() => handleEmojiClick(emojiChar)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl text-2xl transition duration-150 hover:bg-aqua-50 hover:scale-120 active:scale-95 select-none"
                >
                  {emojiChar}
                </button>
              ))}
            </div>
          </div>
        ) : (
          (() => {
            const currentCat = EMOJI_CATEGORIES.find((c) => c.id === activeCategory) || EMOJI_CATEGORIES[0];
            return (
              <div>
                <p className="mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {currentCat.name}
                </p>
                <div className="grid grid-cols-7 sm:grid-cols-8 gap-1">
                  {currentCat.emojis.map((item, idx) => (
                    <button
                      key={`${item.char}-${idx}`}
                      type="button"
                      onClick={() => handleEmojiClick(item.char)}
                      className="flex h-10 w-10 items-center justify-center rounded-2xl text-2xl transition duration-150 hover:bg-aqua-50 hover:scale-120 active:scale-95 select-none"
                    >
                      {item.char}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
