#include "localusr.h"
#include "wideuse.h"

localUsr::localUsr(QString name)
{
    this->usrName = name;
    connect(this,SIGNAL(winInfo(QList<QString>&)),udpthread,SLOT(handleLvl(QList<QString>&)));
    connect(this,SIGNAL(getNew(QList<QString>&)),udpthread,SLOT(addNewPoke(QList<QString>&)));
    connect(this,SIGNAL(dltMy(QList<QString>&)),udpthread,SLOT(dltMy(QList<QString>&)));
}

localUsr::~localUsr()
{
    for(int i = 0; i < 7; i++)
    {
        delete poke[i];
    }
    delete *poke;
}

int localUsr::generateRandomInteger(int min,int max)
{
    Q_ASSERT(min < max);
    static bool seedStatus;
    if (!seedStatus)
    {
        qsrand(QTime(0, 0, 0).secsTo(QTime::currentTime()));
        seedStatus = true;
    }
    int nRandom = qrand() % (max - min);
    nRandom = min + nRandom;

    return nRandom;
}

void localUsr::initUsr(QList<QString> &poke)
{
    /*登录的时候初始化*/
    qint32 num = poke.at(0).toInt();
    pokeSum = num;
    poke.removeFirst();
    if(poke.at(0) != "over")
    {
        QString pokeName;
        qint32 lvl = 0;;
        qint32 exp = 0;
        for(int i = 0; i < num; i++)
        {
            pokeName = poke.at(0);
            poke.removeFirst();
            lvl = poke.at(0).toInt();
            poke.removeFirst();
            exp = poke.at(0).toInt();
            poke.removeFirst();
            poke.removeFirst();
            addPoke(pokeName,lvl,exp,i);
        }
    }
    else
    {
        int which;
        for(int i = 1; i <= 3; i++)
        {
            which = generateRandomInteger(1,12);
            addNewPoke(which,i);
        }
    }
}

void localUsr::addPoke(QString name,qint32 level,qint32 exp,qint32 index)
{
    /*加精灵*/
    if(name == "Hitmonlee")
        poke[index] = new Hitmonlee(level,exp);
    else if(name == "Charmander")
        poke[index] = new Charmander(level,exp);
    else if(name == "Squirtle")
        poke[index] = new Squirtle(level,exp);
    else if(name == "Licktung")
        poke[index] = new Licktung(level,exp);
    else if(name == "Muk")
        poke[index] = new Muk(level,exp);
    else if(name == "Krabby")
        poke[index] = new Krabby(level,exp);
    else if(name == "Shellder")
        poke[index] = new Shellder(level,exp);
    else if(name == "Onix")
        poke[index] = new Onix(level,exp);
    else if(name == "Geodude")
        poke[index] = new Geodude(level,exp);
    else if(name == "Bulbasaur")
        poke[index] = new Bulbasaur(level,exp);
    else if(name == "Pidgeotto")
        poke[index] = new Pidgeotto(level,exp);
    else if(name == "Pikachu")
        poke[index] = new Pikachu(level,exp);

}

void localUsr::dltPoke(qint32 index)
{
    for(; index < getSum() - 1; index++)
        poke[index] = poke[index + 1];
    poke[index] = nullptr;
    dltSum();
}

pokemon* localUsr::chosePoke()
{
    return poke[chosenPoke];
}

pokemon* localUsr::getEnm()
{
    return enmPoke;
}

qint32 localUsr::getSum()
{
    return pokeSum;
}

void localUsr::choseToBattle(qint32 which)
{
    this->chosenPoke = which;
}

qint32 localUsr::getWhich()
{
    return chosenPoke;
}

void localUsr::addSum()
{
    pokeSum++;
}

void localUsr::dltSum()
{
    pokeSum--;
}

void localUsr::createEnm(QList<QString> &enm)
{
    /*新建对手精灵*/
    QString pokeName = enm.at(0);
    qint32 pokeLvl = enm.at(1).toInt();
    if(pokeName == "Hitmonlee")
        enmPoke = new Hitmonlee(pokeLvl,0);
    else if(pokeName == "Charmander")
        enmPoke = new Charmander(pokeLvl,0);
    else if(pokeName == "Squirtle")
        enmPoke = new Squirtle(pokeLvl,0);
    else if(pokeName == "Licktung")
        enmPoke = new Licktung(pokeLvl,0);
    else if(pokeName == "Muk")
        enmPoke = new Muk(pokeLvl,0);
    else if(pokeName == "Krabby")
        enmPoke = new Krabby(pokeLvl,0);
    else if(pokeName == "Shellder")
        enmPoke = new Shellder(pokeLvl,0);
    else if(pokeName == "Onix")
        enmPoke = new Onix(pokeLvl,0);
    else if(pokeName == "Geodude")
        enmPoke = new Geodude(pokeLvl,0);
    else if(pokeName == "Bulbasaur")
        enmPoke = new Bulbasaur(pokeLvl,0);
    else if(pokeName == "Pidgeotto")
        enmPoke = new Pidgeotto(pokeLvl,0);
    else
        enmPoke = new Pikachu(pokeLvl,0);
}

QString localUsr::getName()
{
    return usrName;
}

void localUsr::whichBattle(bool flag)
{
    this->whichBtl = flag;
}

bool localUsr::getBattle()
{
    return whichBtl;
}

qint32 localUsr::chosenLvl()
{
    return poke[chosenPoke]->getLvl();
}

void localUsr::setHave(bool flag)
{
    haveToChose = flag;
}

bool localUsr::getHave()
{
    return haveToChose;
}

void localUsr::setGet(bool flag)
{
    getOrLose = flag;
}

bool localUsr::getGet()
{
    return getOrLose;
}

void localUsr::addNewPoke(int i,int index)
{
    /*给新用户和输光精灵的用户发*/
    QString name;
    switch (i)
    {
    case 1:
    {
        name = "Hitmonlee";
        break;
    }
    case 2:
    {
        name = "Charmander";
        break;
    }
    case 3:
    {
        name = "Squirtle";
        break;
    }
    case 4:
    {
        name = "Licktung";
        break;
    }
    case 5:
    {
        name = "Muk";
        break;
    }
    case 6:
    {
        name = "Krabby";
        break;
    }
    case 7:
    {
        name = "Shellder";
        break;
    }
    case 8:
    {
        name = "Onix";
        break;
    }
    case 9:
    {
        name = "Geodude";
        break;
    }
    case 10:
    {
        name = "Bulbasaur";
        break;
    }
    case 11:
    {
        name = "Pidgeotto";
        break;
    }
    default:
    {
        name = "Pikachu";
        break;
    }
    }
    QList<QString> pokeInfo;
    pokeInfo << "10" << getName() << name << QString::number(1)
             << QString::number(0) << QString::number(index);
    pokeInfo.append(QString::number(1));
    emit getNew(pokeInfo);
}

void localUsr::handleInfo(int flag)
{
    QList<QString> temp;
    if(flag)
    {
        temp.append("8");
        temp.append(getName());
        temp.append(QString::number(getWhich() + 1));
        temp.append(QString::number(poke[chosenPoke]->getLvl()));
        temp.append(QString::number(poke[chosenPoke]->getExp()));
    }
    else
    {
        temp.append("9");
        temp.append(getName());
    }
    emit winInfo(temp);
}

void localUsr::getNewPoke(int flag)
{
    /*获得精灵*/
    qint32 index;
    if(flag)
        index = getSum() - 1;
    else
        index = getWhich();
    addPoke(getEnm()->getName(),getEnm()->getLvl(),getEnm()->getExp(),index);
    QList<QString> pokeInfo;
    pokeInfo << "10" << getName() << poke[index]->getName() << QString::number(poke[index]->getLvl())
             << QString::number(poke[index]->getExp()) << QString::number(index + 1);
    pokeInfo.append(QString::number(flag));
    emit getNew(pokeInfo);
}

void localUsr::dltPoke()
{
    /*失去精灵*/
    qint32 index = getWhich();
    dltPoke(index);
    QList<QString> pokeInfo;
    qint32 time = getSum() - index;
    pokeInfo << "11" << getName() << QString::number(index) << QString::number(time);
    for(int i = 0; i < time; i++)
    {
        pokeInfo.append(poke[index]->getName());
        pokeInfo.append(QString::number(poke[index]->getLvl()));
        pokeInfo.append(QString::number(poke[index]->getExp()));
        index++;
    }
    emit dltMy(pokeInfo);
}
