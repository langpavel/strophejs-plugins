// debug function.
var DD = DD || function(){/* console.debug('DD', arguments); */}; 

Strophe.Contact = Class.create({
	
	initialize: function()
	{
		this.jid = '';
		this.name = '';
		this.approved = '';
		this.subscription = 'none';
		this.resources = {};
		this.ask = '';
		this.groups = [];
	},
	
	isOnline: function()
	{
		var k;
		for(k in this.resources)
		{
			return true;
		}
		return false;
	},
	
	readFromItem: function(item)
	{
		return Strophe.Contact.readFromItem(this, item);
	},
	
});

/**
 * Read contact from XML roster item
 */
Strophe.Contact.readFromItem = function(contact, item)
{
	contact.jid = item.getAttribute('jid');
	contact.name = item.hasAttribute('name') ?
		item.getAttribute('name') : '';
	contact.subscription = item.hasAttribute('subscription') ?
		item.getAttribute('subscription') : 'none';
	contact.ask = item.hasAttribute('ask') ?
		item.getAttribute('ask') : '';
	contact.approved = item.hasAttribute('approved') ?
		item.getAttribute('approved') : '';

	contact.groups = [];
	var g = item.getElementsByTagName('group');
	var gi, gl = g.length;
	for(gi=0;gi<gl;gi++)
		contact.groups.push(g[gi].textContent);
	return contact;
};

// example roster plugin
Strophe.addConnectionPlugin('roster', {

	init: function(connection)
	{
		this._c = connection;
		this.contacts = {};

		Strophe.addNamespace('ROSTER', 'jabber:iq:roster');
	},

	// called when connection status is changed
	statusChanged: function(status)
	{
		if(status === Strophe.Status.CONNECTED)
		{
			this.contacts = {};

			// set up handlers for updates
			this._c.addHandler(
				this._rCh.bind(this), Strophe.NS.ROSTER, "iq");
			this._c.addHandler(
				this._pCh.bind(this), null, "presence");

			// build and send initial roster query
			var roster_iq = $iq({type: 'get'}).c(
				'query', {xmlns: Strophe.NS.ROSTER});

			this._c.send(roster_iq);
		} 
		else if(status === Strophe.Status.DISCONNECTED)
		{
			// set all users offline
			var k;
			for(k in this.contacts)
				this.contacts[k].resources = {};

			// notify user code
			$(document).fire('xmpp:roster_changed', this);
		}
	},

	// called when roster udpates are received
	_rCh: function(iq)
	{
		var iq_type = iq.getAttribute('type');
		if(iq_type !== 'set' && iq_type !== 'result')
		{
			// acknowledge receipt
			this._c.send($iq({type: 'error', id: iq.getAttribute('id')}));
			
			return true;
		}
		
		var items = iq.getElementsByTagName('item');
		var ii, il = items.length;
		for(ii=0;ii<il;ii++)
		{
			var item = items[ii];
			var jid = item.getAttribute('jid');
			var subscription = item.hasAttribute('subscription') ? 
				item.getAttribute('subscription') : 'none';
	
			if(subscription === 'remove')
			{
				// removing contact from roster
				$(document).fire('xmpp:roster_contact_deleting', 
					this.contacts[jid]);
				delete this.contacts[jid];
			}
			else
			{
				// modifying contact on roster
				var contact = this.contacts[jid];
				var cr = false;
				if(!contact)
				{
					contact = new Strophe.Contact();
					cr = true;
				}
				contact.readFromItem(item);
				if(cr)
					this.contacts[jid] = contact;
				$(document).fire('xmpp:roster_contact_changed', contact);
			}
		}

		// acknowledge receipt
		this._c.send($iq({type: 'result', id: iq.getAttribute('id')}));
		
		// notify user code of roster changes
		$(document).fire('xmpp:roster_changed', this);

		return true;
	},

	// called when presence stanzas are received
	_pCh: function(presence)
	{
		var from = presence.getAttribute('from');
		var jid = Strophe.getBareJidFromJid(from);
		var resource = Strophe.getResourceFromJid(from);
		var ptype = presence.hasAttribute('type') ?
				presence.getAttribute('type') : 'available';

		if(!this.contacts[jid] || ptype === "error")
		{
			DD('_pCh: function(presence) unhandled', presence);
			// ignore presence updates from things not on the roster
			// as well as error presence
			return true;
		}

		if(ptype === "unavailable")
		{
			// remove resource, contact went offline
			delete this.contacts[jid].resources[resource];
		} else
		{
			// contact came online or changed status
			this.contacts[jid].resources[resource] = {
				show: $(presence).find("show").text() || "online",
				status: $(presence).find("status").text()
			};
		}

		// notify user code of roster changes
		$(document).fire('xmpp:roster_changed', this);

		return true;
	},

	// add a contact to the roster
	addContact: function(jid, name, groups)
	{
		var iq = $iq({type: "set"}).c("query", {xmlns: Strophe.NS.ROSTER}).c(
				"item", {name: name || "", jid: jid});
		if(groups)
		{
			var i,l = groups.length;
			for(i=0;i<l;i++)
				iq.c("group").t(groups[i]).up();
		}
		this._c.sendIQ(iq);
	},

	// delete a contact from the roster
	deleteContact: function(jid)
	{
		var iq = $iq({type: "set"}).c("query", {xmlns: Strophe.NS.ROSTER}).c(
				"item", {jid: jid, subscription: "remove" });
		this._c.sendIQ(iq);
	},

	// modify a roster contact
	modifyContact: function(jid, name, groups)
	{
		this.addContact(jid, name, groups);
	},

	// subscribe to a new contact's presence
	subscribe: function(jid, name, groups)
	{
		this.addContact(jid, name, groups);
		var presence = $pres({to: jid, "type": "subscribe"});
		this._c.send(presence);
	},

	// unsubscribe from a contact's presence
	unsubscribe: function(jid)
	{
		var presence = $pres({to: jid, "type": "unsubscribe"});
		this._c.send(presence);
		this.deleteContact(jid);
	}
});
