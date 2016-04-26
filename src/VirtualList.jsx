var React = require('react');
var utils = require('./utils');
var bs = require('binarysearch');

var VirtualList = React.createClass({
    propTypes: {
        items: React.PropTypes.array.isRequired,
        itemHeight: React.PropTypes.number.isRequired,
        renderItem: React.PropTypes.func.isRequired,
        container: React.PropTypes.object.isRequired,
        tagName: React.PropTypes.string.isRequired,
        scrollDelay: React.PropTypes.number,
        itemBuffer: React.PropTypes.number,
        fuzzyRender: React.PropTypes.number
    },
    getDefaultProps: function() {
        return {
            container: typeof window !== 'undefined' ? window : undefined,
            tagName: 'div',
            scrollDelay: 0,
            itemBuffer: 0,
            fuzzyRender: 0
        };
    },
    getVirtualState: function(props) {
        // default values
        var state = {
            items: [],
            bufferStart: 0,
            height: 0
        };

        // early return if nothing to render
        if (typeof props.container === 'undefined' || props.items.length === 0 || props.itemHeight <= 0 || !this.isMounted()) return state;

        var items = props.items;
        var itemPositions = null;

        // em - must sum 'height' prop of all items.
        if (!props.itemHeight) {
          itemPositions = this.itemPositions(props);
          var last = state.itemPositions[state.itemPositions.length - 1];
          state.height = last + this._getItemHeight(items[items.length - 1], props);
        } else {
          state.height = props.items.length * props.itemHeight;
        }


        var viewBox = this.viewBox(props);

        // no space to render
        if (viewBox.height <= 0) return state;

        viewBox.top = utils.viewTop(props.container);
        viewBox.bottom = viewBox.top + viewBox.height;

        var listBox = this.listBox(props, state);

        var renderStats = VirtualList.getItems(viewBox, listBox, props.itemHeight, items.length, props.itemBuffer, itemPositions);

        // no items to render
        if (renderStats.itemsInView.length === 0) return state;

        state.items = items.slice(renderStats.firstItemIndex, renderStats.lastItemIndex + 1);
        state.bufferStart = itemPositions ? itemPositions[renderStats.firstItemIndex] : renderStats.firstItemIndex * props.itemHeight;

        /*
          We should not render if the diff between the last bufferStart and the current bufferStart is too small.
        */

        return state;
    },
    getInitialState: function() {
        return this.getVirtualState(this.props);
    },
    shouldComponentUpdate: function(nextProps, nextState) {
        if (Math.abs(this.state.bufferStart - nextState.bufferStart) > this.props.fuzzyRender) return true;
        //if (this.state.bufferStart !== nextState.bufferStart) return true;

        if (this.state.height !== nextState.height) return true;

        var equal = utils.areArraysEqual(this.state.items, nextState.items);

        return !equal;
    },
    viewBox: function viewBox(nextProps) {
        return (this.view = this.view || this._getViewBox(nextProps));
    },
    itemPositions: function itemPositions(nextProps) {
        return (this._itemPositions = this._itemPositions || this._getItemPositions(nextProps));
    },
    _getViewBox: function _getViewBox(nextProps) {
        return {
            height: typeof nextProps.container.innerHeight !== 'undefined' ? nextProps.container.innerHeight : nextProps.container.clientHeight
        };
    },
    _getListBox: function(nextProps, nextState) {
        var list = this.refs.list;

        var top = utils.topDifference(list, nextProps.container);

        return {
            top: top,
            height: nextState.height,
            bottom: top + nextState.height
        };
    },
    _getItemPositions: function(nextProps) {
        var items = nextProps.items;
        var itemPositions = [];
        var getHeightByFunc = nextProps.getItemHeight && !(utils.isPlainObject(items[0]) && items[0].height);

        var atHeight = 0;
        for (i = 0; i < items.length; i++) {
          var height = getHeightByFunc ? nextProps.getItemHeight(items[i]) : items[i].height;
          itemPositions[i] = atHeight;
          atHeight += height;
        }
        return itemPositions;
    },
    _getItemHeight: function(item, props) {
      var getHeightByFunc = props.getItemHeight && !(utils.isPlainObject(item) && items.height);
      return getHeightByFunc ? props.getItemHeight(item) : item.height;
    },
    listBox: function listBox(nextProps, nextState) {
        return (this.list = this.list || this._getListBox(nextProps, nextState));
    },
    componentWillReceiveProps: function(nextProps) {
        // clear caches
        this.view = this.list = this._itemPositions = null;

        var state = this.getVirtualState(nextProps);

        this.props.container.removeEventListener('scroll', this.onScrollDebounced);

        this.onScrollDebounced = utils.debounce(this.onScroll, nextProps.scrollDelay, false);

        nextProps.container.addEventListener('scroll', this.onScrollDebounced);

        this.setState(state);
    },
    componentWillMount: function() {
        //this.animationId = window.requestAnimationFrame(this.onScroll);
        //this.onScrollDebounced = utils.debounce(this.onScroll, this.props.scrollDelay, false);
    },
    componentDidMount: function() {
        var state = this.getVirtualState(this.props);

        this.setState(state);

        this.animationId = window.requestAnimationFrame(this.onScroll);
        //this.props.container.addEventListener('scroll', this.onScrollDebounced);
    },
    componentWillUnmount: function() {
        //this.props.container.removeEventListener('scroll', this.onScrollDebounced);
        window.cancelAnimationFrame(this.animationId);
        this.view = this.list = null;
    },
    onScroll: function() {
        var state = this.getVirtualState(this.props);

        this.setState(state);
        this.animationId = window.requestAnimationFrame(this.onScroll);
    },
    // in case you need to get the currently visible items
    visibleItems: function() {
        return this.state.items;
    },
    render: function() {
        return (
          <this.props.tagName {...this.props} ref="list" style={{boxSizing: 'border-box', height: this.state.height, paddingTop: this.state.bufferStart }} >
              {this.state.items.map(this.props.renderItem)}
          </this.props.tagName>
        );
    }
});

VirtualList.getBox = function getBox(view, list) {
    list.height = list.height || list.bottom - list.top;

    return {
        top: Math.max(0, Math.min(view.top - list.top)),
        bottom: Math.max(0, Math.min(list.height, view.bottom - list.top))
    };
};

VirtualList.getItems = function(viewBox, listBox, itemHeight, itemCount, itemBuffer, itemPositions) {
    if (itemCount === 0) return {
        itemsInView: 0
    };

    // list is below viewport
    if (viewBox.bottom < listBox.top) return {
        itemsInView: 0
    };

    // list is above viewport
    if (viewBox.top > listBox.bottom) return {
        itemsInView: 0
    };

    var listViewBox = VirtualList.getBox(viewBox, listBox);
    var firstItemIndex;
    var lastItemIndex;

    if (itemPositions) {
      var range = bs.range(itemPositions, listViewBox.top, listViewBox.bottom);
      firstItemIndex = Math.max(0, range[0] - itemBuffer);
      lastItemIndex = Math.min(itemCount, range[1] + itemBuffer) - 1;
    } else {
      firstItemIndex = Math.max(0,  Math.floor(listViewBox.top / itemHeight) - itemBuffer);
      lastItemIndex = Math.min(itemCount, Math.ceil(listViewBox.bottom / itemHeight) + itemBuffer) - 1;
    }

    var itemsInView = lastItemIndex - firstItemIndex + 1;

    var result = {
        firstItemIndex: firstItemIndex,
        lastItemIndex: lastItemIndex,
        itemsInView: itemsInView,
    };

    return result;
};

module.exports = VirtualList;
