#include"petcreating.h"
using namespace std;

pokemon::pokemon()
{
    this->level = 1;
    this->atk = 15;
    this->def = 7;
    this->exp = 0;
    this->hp = 300;
    this->fullhp = 300;
    this->interval = 1;
}

QString pokemon::getName()
{
    return this->name;
}

int pokemon::getType()
{
    return type;
}

void pokemon::changetype(int type)
{
    this->type = type;
    if(type == 1)//力量型
    {
        atk += 4;
        def = def - 2;
    }
    else if(type == 2)//肉盾型
    {
        atk = atk - 1;
        def++;
        hp += 20;
        fullhp += 20;
    }
    else if(type == 3)//防御型
    {
        atk = atk - 2;
        def += 3;
    }
    else//敏捷型
    {
        atk = atk + 1;
        def = def - 1;
        interval = interval - 0.1;
    }
}

void pokemon::changeName(QString name)
{
    this->name = name;
}

bool pokemon::alive()
{
    if(hp > 0)
        return 1;
    else
        return 0;
}

double pokemon::atkf()
{
    return interval;
}

int pokemon::damagecost()
{
    return atk;
}

int pokemon::generateRandomInteger(int min, int max)
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

QString pokemon::damagedeal(int damage)
{
    QString action;
    QString mation;
    damage = damage - def;
    if(damage < 0)
        damage = 0;
    int dodge = generateRandomInteger(1,100);
    bool isDodge = 0;
    if(dodge > 80)
    {
        if(type == 4)
        {
            damage = 0;
            action = "闪避了! ";
            isDodge = 1;
        }
        else
        {
            if(damage > 90)
            {
                damage = 0;
                action = "闪避了! ";
                isDodge = 1;
            }
            else;
        }
    }
    if(!isDodge)
    {
        int crush = generateRandomInteger(1,100);
        if(crush > 90)
        {
            damage = damage * 2;
            action = "暴击! ";
        }
    }
    hp = hp - damage;
    QString howMany = QString::number(damage);
    if(hp < 0)
        hp = 0;
    emit fresh();
    return action + " " + mation + ("受到了" + howMany + "点伤害。");
}

void pokemon::hpfull()
{
    hp = fullhp;
}

int pokemon::gain()
{
    return 10*level;
}

void pokemon::gainHp(int suck)
{
    hp += suck;
    if(hp > fullhp)
        hp = fullhp;
}

void pokemon::expup(int bonus)
{
    exp += bonus;
}

bool pokemon::upornot()
{
    if(this->level != 15)
    {
        if(exp >= 5*level)
            return 1;
        else
            return 0;
    }
    return 0;
}

void pokemon::lvlup()//升级函数，根据精灵类型会有不同
{
    if(level == 15)
        hpfull();
    else
    {
        level++;
        exp = 0;
        hpfull();
        if(type == 1)
        {
            atk += 12;
            def += 5;
            hp += 62;
            fullhp += 62;
        }
        else if(type == 2)
        {
            atk += 7;
            def += 6;
            hp += 108;
            fullhp += 108;
        }
        else if(type == 3)
        {
            atk += 7;
            def += 7;
            hp += 60;
            fullhp += 60;
        }
        else
        {
            atk += 8;
            def += 5;
            hp += 50;
            fullhp += 50;
            interval = interval - 0.03;
        }
    }
}

void pokemon::Test()
{
    qDebug() << hp << " " << atk << " " << def << " " << interval << endl;
}

int pokemon::getHp()
{
    return hp;
}

int pokemon::getFullHp()
{
    return fullhp;
}

int pokemon::getLvl()
{
    return level;
}

int pokemon::getExp()
{
    return exp;
}

int pokemon::getTimer()
{
    if(timer > 0)
    {
        timer--;
        return timer + 1;
    }
    else
    {
        setState(0);
        return 0;
    }
}

void pokemon::setTimer(int setting)
{
    timer = setting;
}

int pokemon::getState()
{
    return state;
}

void pokemon::setState(int which)
{
    state = which;
}

QString str_pkm::skill()
{
    setTimer(3);
    setState(3);
    return "英勇打击！";
}

QString fat_pkm::skill()
{
    gainHp(damagecost() * 2);
    return "生命汲取！";
}

QString def_pkm::skill()
{
    setState(2);
    setTimer(3);
    return "石化表皮!";
}

QString agi_pkm::skill()
{
    return "眩晕！";
}

Hitmonlee::Hitmonlee(int lvl,int exp)
{
    changetype(1);
    changeName("Hitmonlee");
    for(int i = 1; i < lvl; i++)
        lvlup();
    this->expup(exp);
}

Charmander::Charmander(int lvl,int exp)
{
    changetype(1);
    changeName("Charmander");
    for(int i = 1; i < lvl; i++)
        lvlup();
    this->expup(exp);
}

Squirtle::Squirtle(int lvl,int exp)
{
    changetype(1);
    changeName("Squirtle");
    for(int i = 1; i < lvl; i++)
        lvlup();
    this->expup(exp);
}

Licktung::Licktung(int lvl,int exp)
{
    changetype(2);
    changeName("Licktung");
    for(int i = 1; i < lvl; i++)
        lvlup();
    this->expup(exp);
}

Muk::Muk(int lvl,int exp)
{
    changetype(2);
    changeName("Muk");
    for(int i = 1; i < lvl; i++)
        lvlup();
    this->expup(exp);
}

Krabby::Krabby(int lvl,int exp)
{
    changetype(2);
    changeName("Krabby");
    for(int i = 1; i < lvl; i++)
        lvlup();
    this->expup(exp);
}

Geodude::Geodude(int lvl,int exp)
{
    changetype(3);
    changeName("Geodude");
    for(int i = 1; i < lvl; i++)
        lvlup();
    this->expup(exp);
}

Shellder::Shellder(int lvl,int exp)
{
    changetype(3);
    changeName("Shellder");
    for(int i = 1; i < lvl; i++)
        lvlup();
    this->expup(exp);
}

Onix::Onix(int lvl,int exp)
{
    changetype(3);
    changeName("Onix");
    for(int i = 1; i < lvl; i++)
        lvlup();
    this->expup(exp);
}

Bulbasaur::Bulbasaur(int lvl,int exp)
{
    changetype(4);
    changeName("Bulbasaur");
    for(int i = 1; i < lvl; i++)
        lvlup();
    this->expup(exp);
}

Pidgeotto::Pidgeotto(int lvl,int exp)
{
    changetype(4);
    changeName("Pidgeotto");
    for(int i = 1; i < lvl; i++)
        lvlup();
    this->expup(exp);
}

Pikachu::Pikachu(int lvl,int exp)
{
    changetype(4);
    changeName("Pikachu");
    for(int i = 1; i < lvl; i++)
        lvlup();
    this->expup(exp);
}

QString Hitmonlee::attack()
{
    return "Hit!";
}

QString Charmander::attack()
{
    return "Fire!";
}

QString Squirtle::attack()
{
    return "Taste my water!";
}

QString Licktung::attack()
{
    return "Lick, lick!";
}

QString Muk::attack()
{
    return "Eat my gross muk!";
}

QString Krabby::attack()
{
    return "No one can live under my claw!";
}

QString Geodude::attack()
{
    return "Stone power!";
}

QString Shellder::attack()
{
    return "Shield smash!";
}

QString Onix::attack()
{
    return "You will die for your arrogance!";
}

QString Bulbasaur::attack()
{
    return "Eat my seed!";
}

QString Pidgeotto::attack()
{
    return "Can you defend my air attack?";
}

QString Pikachu::attack()
{
    return "Pika pika!";
}
/*
pokemon* chooseyourpet()
{
    int type = 0;
    int specy = 0;
    pokemon *born;
    while(((type != 1)&&(type != 2)&&(type != 3)&&(type != 4))||(specy == 4))
    {
        qDebug() << "Now you can choose one pokemon." << endl << "Which type do you want?" << endl << "Press 1 for strong type, 2 for fat type, 3 for defence type, and 4 for agile type: " ;
        cin >> type;
        qDebug() << "I got it!" << endl;
        if(type == 1)
        {
            while((specy != 1)&&(specy != 2)&&(specy != 3)&&(specy != 4))
            {
                qDebug() << "Which pokemon do you want? Press 1 for Hitmonlee, 2 for Charmander, 3 for Squirtle, 4 to re-choose the type: " ;
                cin >> specy;
                if(specy == 1)
                    born = new Hitmonlee;
                else if(specy == 2)
                    born = new Charmander;
                else if(specy == 3)
                    born = new Squirtle;
                else if(specy == 4)
                    type = 0;
                else;
                if((specy == 1)||(specy == 2)||(specy == 3))
                    born->type = 1;
            }
        }
        else if(type == 2)
        {
            while((specy != 1)&&(specy != 2)&&(specy != 3)&&(specy != 4))
            {
                qDebug() << "Which pokemon do you want? Press 1 for Licktung, 2 for Muk, 3 for Krabby, 4 to re-choose the type: " ;
                cin >> specy;
                if(specy == 1)
                    born = new Licktung;
                else if(specy == 2)
                    born = new Muk;
                else if(specy == 3)
                    born = new Krabby;
                else if(specy == 4)
                    type = 0;
                if((specy == 1)||(specy == 2)||(specy == 3))
                    born->type = 2;
            }
        }
        else if(type == 3)
        {
            while((specy != 1)&&(specy != 2)&&(specy != 3)&&(specy != 4))
            {
                qDebug() << "Which pokemon do you want? Press 1 for Geodude, 2 for Shellder, 3 for Onix, 4 to re-choose the type: " ;
                cin >> specy;
                if(specy == 1)
                    born = new Geodude;
                else if(specy == 2)
                    born = new Shellder;
                else if(specy == 3)
                    born = new Onix;
                else if(specy == 4)
                    type = 0;
                if((specy == 1)||(specy == 2)||(specy == 3))
                    born->type = 3;
            }
        }
        else if(type == 4)
        {
            while((specy != 1)&&(specy != 2)&&(specy != 3)&&(specy != 4))
            {
                qDebug() << "Which pokemon do you want? Press 1 for Bulbarsaur, 2 for Pidgeotto, 3 for Pikachu, 4 to re-choose the type: " ;
                cin >> specy;
                if(specy == 1)
                    born = new Bulbasaur;
                else if(specy == 2)
                    born = new Pidgeotto;
                else if(specy == 3)
                    born = new Pikachu;
                else if(specy == 4)
                    type = 0;
                if((specy == 1)||(specy == 2)||(specy == 3))
                    born->type = 4;
            }
        }
        specy = 0;
    }
    born->changetype();
    return born;
}

int main()
{
    qDebug() << "This is the test version 0.0.1" << endl;
    pokemon *a,*b;
    a = chooseyourpet();
    b = chooseyourpet();
    for(int i = 0;i<14;i++)
    {
        a->lvlup();
        b->lvlup();
    }
    battle(*a,*b);
    a->Test();
    b->Test();
    return 0;
}*/
