#include "udpreceiver.h"
#include "ui_udpreceiver.h"
#include <QDebug>

udpReceiver::udpReceiver(QWidget *parent) :
    QMainWindow(parent),
    ui(new Ui::udpReceiver)
{
    ui->setupUi(this);
    loger = new Log;
    bindPort();
}

udpReceiver::~udpReceiver()
{
    delete ui;
    delete receiver;
    delete sender;
}

void udpReceiver::bindPort()
{
    receiver = new QUdpSocket(this);
    sender = new QUdpSocket(this);
    receiver->bind(rcvPort,QUdpSocket::DontShareAddress);
    sender->bind(sendPort,QUdpSocket::DontShareAddress);
    connect(receiver,SIGNAL(readyRead()),this,SLOT(dealDatagram()));
}

void udpReceiver::usrs(int inOrNew,QString name,QString pwd,QHostAddress address,quint16 hisPort)
{
    QList<QString> infoM;
    QByteArray sendgram;
    if(inOrNew == 1)
    {
        infoM.append("1");
        qint32 flag = userIn(name,pwd);
        if(flag == 3)
            infoM.append("3");
        else if(flag == 2)
            infoM.append("2");
        else if(flag == 1)        
            infoM.append("1");
        else        
            infoM.append("0");
    }
    else
    {
        infoM.append("2");
        if(newUsr(name,pwd))
            infoM.append("1");
        else        
            infoM.append("0");
    }
    QDataStream stream(&sendgram, QIODevice::WriteOnly);
    stream << infoM;
    sender->writeDatagram(sendgram,address,hisPort);
}

qint32 udpReceiver::userIn(QString name,QString pwd)
{
    QString usrPwd = loger->searchPwd(name);
    if(pwd == usrPwd)
    {
        if(loger->aliveOrNot(name))
            return 3;
        else
        {
            loger->linkStart(name);
            return 2;
        }
    }
    else if(usrPwd == "NULL")
    {
        return 1;
    }
    return 0;
}

bool udpReceiver::newUsr(QString name,QString pwd)
{
    if(loger->addNewusr(name,pwd))
        return true;
    return false;
}

void udpReceiver::txShow(QHostAddress address,quint16 hisPort)
{
    sender->writeDatagram("y",address,hisPort);
}

void udpReceiver::linkOver(QString name,QHostAddress address,quint16 hisPort)
{
    loger->freeConnection(name);
    QByteArray temp;
    QList<QString> content;
    content.append("4");
    content.append("1");
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << content;
    sender->writeDatagram(temp,address,hisPort);
}

void udpReceiver::userInfo(QHostAddress address,quint16 hisPort)
{
    QByteArray temp;
    QList<QString> usrInfo;
    usrInfo.append("5");
    usrInfo.append(loger->getUsr());
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << usrInfo;
    sender->writeDatagram(temp,address,hisPort);
}

void udpReceiver::pokeInfo(QHostAddress address,quint16 hisPort)
{
    QByteArray temp;
    QList<QString> pokeInfo;
    pokeInfo.append("6");
    pokeInfo.append(loger->getPoke());
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << pokeInfo;
    sender->writeDatagram(temp,address,hisPort);
}

void udpReceiver::usrPoke(QString name,QHostAddress address,quint16 hisPort)
{
    QByteArray temp;
    QList<QString> usrpoke;
    usrpoke.append("7");
    usrpoke.append(loger->getUsrPoke(name));
    QDataStream stream(&temp, QIODevice::WriteOnly);
    stream << usrpoke;
    sender->writeDatagram(temp,address,hisPort);
}

void udpReceiver::handleWinner(QList<QString> &info)
{
    QString name = info.at(0);
    QString which = info.at(1);
    QString lvl = info.at(2);
    QString exp = info.at(3);
    loger->updateWinner(name,which,lvl,exp);
}

void udpReceiver::handleLoser(QList<QString> &info)
{
    QString name = info.at(0);
    loger->updateLoser(name);
}

void udpReceiver::addNewPoke(QList<QString> &info)
{
    QString name = info.at(0);
    QString poke = info.at(1);
    qint32 lvl = info.at(2).toInt();
    qint32 exp = info.at(3).toInt();
    QString index = info.at(4);
    bool flag = info.at(5).toInt();
    loger->addNew(name,poke,lvl,exp,index,flag);
}

void udpReceiver::dltPoke(QList<QString> &info)
{
    QString name = info.at(0);
    info.removeFirst();
    qint32 index = info.at(0).toInt();
    qint32 number = info.at(0).toInt();
    info.removeFirst();
    info.removeFirst();
    if(!info.isEmpty())
    {
        QString which;
        QString lvl;
        QString exp;
        for(int i = 0; i < number; i++)
        {
            which = info.at(0);
            info.removeFirst();
            lvl = info.at(0);
            info.removeFirst();
            exp = info.at(0);
            info.removeFirst();
            loger->dltOne(name,which,lvl,exp,QString::number(index + 1));
            index++;
        }
    }
    loger->dltSum(name);
    loger->dltOne(name,nullptr,nullptr,nullptr,QString::number(index + 1));
}

void udpReceiver::dealDatagram()
{
    QHostAddress *sendIp = new QHostAddress;
    quint16 *hisPort = new quint16;
    quint16 sendBack;
    while(receiver->hasPendingDatagrams())
    {
        QByteArray datagram;
        datagram.resize(receiver->pendingDatagramSize());
        receiver->readDatagram(datagram.data(),datagram.size(),sendIp,hisPort);
        sendBack = *hisPort;
        sendBack = sendBack - 1;
        QList<QString> toDo;
        QDataStream stream(&datagram, QIODevice::ReadWrite);
        stream >> toDo;
        qint32 which = toDo.at(0).toInt();
        switch(which)
        {
        case 1:
        case 2:
        {
            /*登录或注册*/
            usrs(which,toDo.at(1),toDo.at(2),*sendIp,sendBack);
            break;
        }
        case 3:
        {
            /*掉线测试*/
            txShow(*sendIp,sendBack);
            break;
        }
        case 4:
        {
            /*下线*/
            linkOver(toDo.at(1),*sendIp,sendBack);
            break;
        }
        case 5:
        {
            /*用户信息*/
            userInfo(*sendIp,sendBack);
            break;
        }
        case 6:
        {
            /*虚拟精灵列表*/
            pokeInfo(*sendIp,sendBack);
            break;
        }
        case 7:
        {
            /*本机用户*/
            usrPoke(toDo.at(1),*sendIp,sendBack);
            break;
        }
        case 8:
        {
            /*获胜结算*/
            toDo.removeFirst();
            handleWinner(toDo);
            break;
        }
        case 9:
        {
            /*失败*/
            toDo.removeFirst();
            handleLoser(toDo);
            break;
        }
        case 10:
        {
            /*加精灵*/
            toDo.removeFirst();
            addNewPoke(toDo);
            break;
        }
        case 11:
        {
            /*删精灵*/
            toDo.removeFirst();
            dltPoke(toDo);
            break;
        }
        default:
            break;
        }
    }
    delete sendIp;
}
