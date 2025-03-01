/*
Copyright 2015, 2016 OpenMarket Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';

const React = require('react');

const MatrixClientPeg = require('../../MatrixClientPeg');
const ContentRepo = require("matrix-js-sdk").ContentRepo;
const Modal = require('../../Modal');
const sdk = require('../../index');
const dis = require('../../dispatcher');

import { linkifyAndSanitizeHtml } from '../../HtmlUtils';
import Promise from 'bluebird';
import { _t } from '../../languageHandler';
import { instanceForInstanceId, protocolNameForInstanceId } from '../../utils/DirectoryUtils';
import Analytics from '../../Analytics';
import SdkConfig from '../../SdkConfig';

import Tchap from "../../Tchap";

const MAX_NAME_LENGTH = 80;
const MAX_TOPIC_LENGTH = 160;

function track(action) {
    Analytics.trackEvent('RoomDirectory', action);
}

module.exports = React.createClass({
    displayName: 'RoomDirectory',

    propTypes: {
        config: React.PropTypes.object,
        onFinished: React.PropTypes.func.isRequired,
    },

    getDefaultProps: function() {
        return {
            config: {},
        };
    },

    getInitialState: function() {
        const homeserverList = SdkConfig.get()['hs_url_list'];
        return {
            publicRooms: [],
            loading: true,
            protocolsLoading: true,
            error: null,
            instanceId: null,
            includeAll: true,
            filterString: null,
            serverList: homeserverList || [],
        };
    },

    childContextTypes: {
        matrixClient: React.PropTypes.object,
    },

    getChildContext: function() {
        return {
            matrixClient: MatrixClientPeg.get(),
        };
    },

    componentWillMount: function() {
        this._unmounted = false;
        this.nextBatch = null;
        this.filterTimeout = null;
        this.scrollPanel = null;
        this.protocols = null;

        this.setState({protocolsLoading: true});
        if (!MatrixClientPeg.get()) {
            // We may not have a client yet when invoked from welcome page
            this.setState({protocolsLoading: false});
            return;
        }
        MatrixClientPeg.get().getThirdpartyProtocols().done((response) => {
            this.protocols = response;
            this.setState({protocolsLoading: false});
        }, (err) => {
            console.warn(`error loading thirdparty protocols: ${err}`);
            this.setState({protocolsLoading: false});
            if (MatrixClientPeg.get().isGuest()) {
                // Guests currently aren't allowed to use this API, so
                // ignore this as otherwise this error is literally the
                // thing you see when loading the client!
                return;
            }
            track('Failed to get protocol list from homeserver');
            this.setState({
                error: _t(
                    'Tchap failed to get the protocol list from the homeserver. ' +
                    'The homeserver may be too old to support third party networks.',
                ),
            });
        });

        this._populateRoomList();

        // dis.dispatch({
        //     action: 'panel_disable',
        //     sideDisabled: true,
        //     middleDisabled: true,
        // });
    },

    componentWillUnmount: function() {
        // dis.dispatch({
        //     action: 'panel_disable',
        //     sideDisabled: false,
        //     middleDisabled: false,
        // });
        if (this.filterTimeout) {
            clearTimeout(this.filterTimeout);
        }
        this._unmounted = true;
    },

    refreshRoomList: function() {
        this.nextBatch = null;
        this.setState({
            publicRooms: [],
            loading: true,
        });
        this._populateRoomList();
    },

    _populateRoomList: function() {
        const homeserverList = this.state.serverList;
        for (let i = 0; i < homeserverList.length; i++) {
            this.getMoreRooms(homeserverList[i]).done();
        }
    },

    getMoreRooms: function(homeServer) {
        if (!MatrixClientPeg.get()) return Promise.resolve();

        const my_filter_string = this.state.filterString;
        const my_server = homeServer;
        const opts = {};
        if (my_server != MatrixClientPeg.getHomeServerName()) {
            opts.server = my_server;
        }
        if (this.state.instanceId) {
            opts.third_party_instance_id = this.state.instanceId;
        } else if (this.state.includeAll) {
            opts.include_all_networks = true;
        }
        if (my_filter_string) opts.filter = { generic_search_term: my_filter_string };
        return MatrixClientPeg.get().publicRooms(opts).then((data) => {
            if (my_filter_string != this.state.filterString) {
                // if the filter or server has changed since this request was sent,
                // throw away the result (don't even clear the busy flag
                // since we must still have a request in flight)
                return;
            }

            if (this._unmounted) {
                // if we've been unmounted, we don't care either.
                return;
            }

            this.setState((s) => {
                s.publicRooms.push(...data.chunk);
                s.loading = false;
                return s;
            });
            return Boolean(data.next_batch);
        }, (err) => {
            if (
                my_filter_string != this.state.filterString) {
                // as above: we don't care about errors for old
                // requests either
                return;
            }

            if (this._unmounted) {
                // if we've been unmounted, we don't care either.
                return;
            }

            console.error("Failed to get publicRooms: %s", JSON.stringify(err));
            track('Failed to get public room list');
            this.setState({
                loading: false,
                error:
                    `${_t('Tchap failed to get the public room list.')} ` +
                    `${(err && err.message) ? err.message : _t('The homeserver may be unavailable or overloaded.')}`
                ,
            });
        });
    },

    /**
     * A limited interface for removing rooms from the directory.
     * Will set the room to not be publicly visible and delete the
     * default alias. In the long term, it would be better to allow
     * HS admins to do this through the RoomSettings interface, but
     * this needs SPEC-417.
     */
    removeFromDirectory: function(room) {
        const alias = get_display_alias_for_room(room);
        const name = room.name || alias || _t('Unnamed room');

        const QuestionDialog = sdk.getComponent("dialogs.QuestionDialog");
        const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");

        let desc;
        if (alias) {
            desc = _t('Delete the room alias %(alias)s and remove %(name)s from the directory?', {alias: alias, name: name});
        } else {
            desc = _t('Remove %(name)s from the directory?', {name: name});
        }

        Modal.createTrackedDialog('Remove from Directory', '', QuestionDialog, {
            title: _t('Remove from Directory'),
            description: desc,
            onFinished: (should_delete) => {
                if (!should_delete) return;

                const Loader = sdk.getComponent("elements.Spinner");
                const modal = Modal.createDialog(Loader);
                let step = _t('remove %(name)s from the directory.', {name: name});

                MatrixClientPeg.get().setRoomDirectoryVisibility(room.room_id, 'private').then(() => {
                    if (!alias) return;
                    step = _t('delete the alias.');
                    return MatrixClientPeg.get().deleteAlias(alias);
                }).done(() => {
                    modal.close();
                    this.refreshRoomList();
                }, (err) => {
                    modal.close();
                    this.refreshRoomList();
                    console.error("Failed to " + step + ": " + err);
                    Modal.createTrackedDialog('Remove from Directory Error', '', ErrorDialog, {
                        title: _t('Error'),
                        description: ((err && err.message) ? err.message : _t('The server may be unavailable or overloaded')),
                    });
                });
            },
        });
    },

    onRoomClicked: function(room, ev) {
        if (ev.shiftKey) {
            ev.preventDefault();
            this.removeFromDirectory(room);
        } else {
            this.showRoom(room);
        }
    },

    onFillRequest: function(backwards) {
        if (backwards || !this.nextBatch) return Promise.resolve(false);

        return this.getMoreRooms();
    },

    onFilterChange: function(alias) {
        this.setState({
            filterString: alias || null,
        });

        // don't send the request for a little bit,
        // no point hammering the server with a
        // request for every keystroke, let the
        // user finish typing.
        if (this.filterTimeout) {
            clearTimeout(this.filterTimeout);
        }
        this.filterTimeout = setTimeout(() => {
            this.filterTimeout = null;
            this.refreshRoomList();
        }, 700);
    },

    onFilterClear: function() {
        // update immediately
        this.setState({
            filterString: null,
        }, this.refreshRoomList);

        if (this.filterTimeout) {
            clearTimeout(this.filterTimeout);
        }
    },

    onCreateRoomClicked: function() {
        this.props.onFinished();
        dis.dispatch({action: 'view_create_room'});
    },

    showRoomAlias: function(alias) {
        this.showRoom(null, alias);
    },

    showRoom: function(room, room_alias) {
        this.props.onFinished();
        const payload = {action: 'view_room'};
        if (room) {
            // Don't let the user view a room they won't be able to either
            // peek or join: fail earlier so they don't have to click back
            // to the directory.
            if (MatrixClientPeg.get().isGuest()) {
                if (!room.world_readable && !room.guest_can_join) {
                    dis.dispatch({action: 'require_registration'});
                    return;
                }
            }

            if (!room_alias) {
                room_alias = get_display_alias_for_room(room);
            }

            payload.oob_data = {
                avatarUrl: room.avatar_url,
                // XXX: This logic is duplicated from the JS SDK which
                // would normally decide what the name is.
                name: room.name || room_alias || _t('Unnamed room'),
            };
        }
        // It's not really possible to join Matrix rooms by ID because the HS has no way to know
        // which servers to start querying. However, there's no other way to join rooms in
        // this list without aliases at present, so if roomAlias isn't set here we have no
        // choice but to supply the ID.
        if (room_alias) {
            payload.room_alias = room_alias;
        } else {
            payload.room_id = room.room_id;
        }
        dis.dispatch(payload);
    },

    getRows: function() {
        const BaseAvatar = sdk.getComponent('avatars.BaseAvatar');

        if (!this.state.publicRooms) return [];

        const rooms = this.state.publicRooms;
        const rows = [];
        const self = this;

        rooms.sort((a, b) => {
            return b.num_joined_members - a.num_joined_members;
        });

        for (let i = 0; i < rooms.length; i++) {

            let name = rooms[i].name || get_display_alias_for_room(rooms[i]) || _t('Unnamed room');
            if (name.length > MAX_NAME_LENGTH) {
                name = `${name.substring(0, MAX_NAME_LENGTH)}...`;
            }

            const domain = Tchap.getDomainFromId(rooms[i].room_id);

            let topic = rooms[i].topic || '';
            if (topic.length > MAX_TOPIC_LENGTH) {
                topic = `${topic.substring(0, MAX_TOPIC_LENGTH)}...`;
            }
            topic = linkifyAndSanitizeHtml(topic);

            rows.push(
                <tr key={ rooms[i].room_id }
                    onClick={self.onRoomClicked.bind(self, rooms[i])}
                    // cancel onMouseDown otherwise shift-clicking highlights text
                    onMouseDown={(ev) => {ev.preventDefault();}}
                >
                    <td className="mx_RoomDirectory_roomAvatar">
                        <BaseAvatar width={24} height={24} resizeMethod='crop'
                            name={ name } idName={ name }
                            url={ ContentRepo.getHttpUriForMxc(
                                    MatrixClientPeg.get().getHomeserverUrl(),
                                    rooms[i].avatar_url, 24, 24, "crop") } />
                    </td>
                    <td className="mx_RoomDirectory_roomDescription">
                        <div className="mx_RoomDirectory_name">{ name }</div>&nbsp;
                        <div className="mx_RoomDirectory_topic"
                             onClick={ function(e) { e.stopPropagation(); } }
                             dangerouslySetInnerHTML={{ __html: topic }} />
                        <div className="mx_RoomDirectory_alias">{ domain }</div>
                    </td>
                    <td className="mx_RoomDirectory_roomMemberCount">
                        { rooms[i].num_joined_members }
                    </td>
                </tr>,
            );
        }
        return rows;
    },

    collectScrollPanel: function(element) {
        this.scrollPanel = element;
    },

    _stringLooksLikeId: function(s, field_type) {
        let pat = /^#[^\s]+:[^\s]/;
        if (field_type && field_type.regexp) {
            pat = new RegExp(field_type.regexp);
        }

        return pat.test(s);
    },

    _getFieldsForThirdPartyLocation: function(userInput, protocol, instance) {
        // make an object with the fields specified by that protocol. We
        // require that the values of all but the last field come from the
        // instance. The last is the user input.
        const requiredFields = protocol.location_fields;
        if (!requiredFields) return null;
        const fields = {};
        for (let i = 0; i < requiredFields.length - 1; ++i) {
            const thisField = requiredFields[i];
            if (instance.fields[thisField] === undefined) return null;
            fields[thisField] = instance.fields[thisField];
        }
        fields[requiredFields[requiredFields.length - 1]] = userInput;
        return fields;
    },

    /**
     * called by the parent component when PageUp/Down/etc is pressed.
     *
     * We pass it down to the scroll panel.
     */
    handleScrollKey: function(ev) {
        if (this.scrollPanel) {
            this.scrollPanel.handleScrollKey(ev);
        }
    },

    render: function() {
        const Loader = sdk.getComponent("elements.Spinner");
        const BaseDialog = sdk.getComponent('views.dialogs.BaseDialog');
        const AccessibleButton = sdk.getComponent('elements.AccessibleButton');

        let content;
        if (this.state.error) {
            content = this.state.error;
        } else if (this.state.protocolsLoading || this.state.loading) {
            content = <Loader />;
        } else {
            const rows = this.getRows();
            // we still show the scrollpanel, at least for now, because
            // otherwise we don't fetch more because we don't get a fill
            // request from the scrollpanel because there isn't one
            let scrollpanel_content;
            if (rows.length == 0) {
                scrollpanel_content = <i>{ _t('No rooms to show') }</i>;
            } else {
                scrollpanel_content = <table ref="directory_table" className="mx_RoomDirectory_table">
                    <tbody>
                        { this.getRows() }
                    </tbody>
                </table>;
            }
            const ScrollPanel = sdk.getComponent("structures.ScrollPanel");
            content = <ScrollPanel ref={this.collectScrollPanel}
                className="mx_RoomDirectory_tableWrapper"
                onFillRequest={ this.onFillRequest }
                stickyBottom={false}
                startAtBottom={false}
            >
                { scrollpanel_content }
            </ScrollPanel>;
        }

        let listHeader;
        if (!this.state.protocolsLoading) {
            const DirectorySearchBox = sdk.getComponent('elements.DirectorySearchBox');

            const protocolName = protocolNameForInstanceId(this.protocols, this.state.instanceId);
            let instance_expected_field_type;
            if (
                protocolName &&
                this.protocols &&
                this.protocols[protocolName] &&
                this.protocols[protocolName].location_fields.length > 0 &&
                this.protocols[protocolName].field_types
            ) {
                const last_field = this.protocols[protocolName].location_fields.slice(-1)[0];
                instance_expected_field_type = this.protocols[protocolName].field_types[last_field];
            }


            let placeholder = _t('Search for a room');

            let showJoinButton = this._stringLooksLikeId(this.state.filterString, instance_expected_field_type);
            if (protocolName) {
                const instance = instanceForInstanceId(this.protocols, this.state.instanceId);
                if (this._getFieldsForThirdPartyLocation(this.state.filterString, this.protocols[protocolName], instance) === null) {
                    showJoinButton = false;
                }
            }

            listHeader = <div className="mx_RoomDirectory_listheader">
                <DirectorySearchBox
                    className="mx_RoomDirectory_searchbox"
                    onChange={this.onFilterChange} onClear={this.onFilterClear}
                    placeholder={placeholder} showJoinButton={showJoinButton}
                />
            </div>;
        }

        const createRoomButton = (<AccessibleButton
            onClick={this.onCreateRoomClicked}
            className="mx_RoomDirectory_createRoom"
        >{_t("Create new room")}</AccessibleButton>);

        return (
            <BaseDialog
                className={'mx_RoomDirectory_dialog'}
                hasCancel={true}
                onFinished={this.props.onFinished}
                headerButton={createRoomButton}
                title={_t("Room directory")}
            >
                <div className="mx_RoomDirectory">
                    <div className="mx_RoomDirectory_list">
                        {listHeader}
                        {content}
                    </div>
                </div>
            </BaseDialog>
        );
    },
});

// Similar to matrix-react-sdk's MatrixTools.getDisplayAliasForRoom
// but works with the objects we get from the public room list
function get_display_alias_for_room(room) {
    return room.canonical_alias || (room.aliases ? room.aliases[0] : "");
}
