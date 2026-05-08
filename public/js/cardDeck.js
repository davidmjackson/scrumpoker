(function attachCardDeck(window) {
    const defaultTiming = {
        flipTransitionMs: 600,
        flipStaggerDelayMs: 150,
        introDelayMs: 300,
        resetTurnaroundDelayMs: 240
    };

    function createVotingCard({
        document,
        value,
        selected = false,
        disabled = false,
        onClick = null,
        cardBackImageSrc = '/images/cardback.jpg'
    }) {
        const cardButton = document.createElement('button');
        cardButton.dataset.value = value;
        cardButton.classList.add('vote-card');
        cardButton.disabled = disabled;

        const cardInner = document.createElement('div');
        cardInner.classList.add('card-inner');

        const cardBack = document.createElement('div');
        cardBack.classList.add('card-face', 'card-back');

        const cardBackImg = document.createElement('img');
        cardBackImg.src = cardBackImageSrc;
        cardBackImg.alt = 'Playing card back';
        cardBackImg.classList.add('vote-card-image');
        cardBack.appendChild(cardBackImg);

        const cardFront = document.createElement('div');
        cardFront.classList.add('card-face', 'card-front');
        cardFront.textContent = value;

        cardInner.appendChild(cardBack);
        cardInner.appendChild(cardFront);
        cardButton.appendChild(cardInner);

        if (selected) {
            cardButton.classList.add('selected');
        }

        if (onClick) {
            cardButton.addEventListener('click', onClick);
        }

        return cardButton;
    }

    function createCardAnimator({ getCards, timing = {} }) {
        const config = { ...defaultTiming, ...timing };
        let timers = [];

        function clear() {
            timers.forEach(clearTimeout);
            timers = [];
        }

        function getCardList() {
            return Array.from(getCards());
        }

        function flipCardsInOrder(cards, { faceDown, reverse = false, startDelayMs = 0 }) {
            const orderedCards = reverse ? [...cards].reverse() : cards;

            orderedCards.forEach((card, index) => {
                const timer = setTimeout(() => {
                    card.classList.toggle('is-face-down', faceDown);
                }, startDelayMs + index * config.flipStaggerDelayMs);
                timers.push(timer);
            });

            return startDelayMs + Math.max(0, orderedCards.length - 1) * config.flipStaggerDelayMs + config.flipTransitionMs;
        }

        function animateCardsIntoView() {
            clear();

            const cards = getCardList();
            if (cards.length === 0) return;

            cards.forEach((card) => {
                card.classList.add('is-face-down');
            });

            const firstTimer = setTimeout(() => {
                flipCardsInOrder(cards, { faceDown: false });
            }, config.introDelayMs);

            timers.push(firstTimer);
        }

        function animateCardsFaceDownBeforeReset(onComplete) {
            clear();

            const cards = getCardList();
            if (cards.length === 0) {
                onComplete();
                return;
            }

            const faceDownDurationMs = flipCardsInOrder(cards, { faceDown: true, reverse: true });
            const completeTimer = setTimeout(() => {
                onComplete();
            }, faceDownDurationMs + config.resetTurnaroundDelayMs);
            timers.push(completeTimer);
        }

        return {
            animateCardsFaceDownBeforeReset,
            animateCardsIntoView,
            clear
        };
    }

    window.ScrumPokerCardDeck = {
        createCardAnimator,
        createVotingCard
    };
})(window);
